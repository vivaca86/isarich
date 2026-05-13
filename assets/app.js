        const APP_VERSION = "1.0.23";
        // Rollback switch: set false to hide/remove monthly review mode instantly.
        const ENABLE_MONTHLY_REVIEW_MODE = true;
        const HISTORY_FETCH_PAGE_SIZE = 500;
        const HISTORY_FETCH_MAX_PAGES = 100;
        const MY_GAS_URL = "https://script.google.com/macros/s/AKfycbxW-WaMughV03d2tarKDoFGkwliIltREbnbiPpA1L-CpvOcXGLpSe-PuZRs2HO4EnbCWw/exec"; 
        const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];
        const CAT_NAMES = { "1": "원금", "2": "특별", "3": "배당" };
        const CAT_ICONS = { 
            "1": '<svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/><path d="M16 12h5"/></svg>',
            "2": '<svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
            "3": '<svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18.06"/><path d="M7 6h1v4"/></svg>'
        };

        const BUY_PLAN_TICKERS = ['486290', '474220'];
        const BUY_PLAN_WEIGHTS = [0.6, 0.4];
        const PENDING_TX_STORAGE_KEY = 'isa_pending_transactions_v1';
        const LOCAL_DATA_CACHE_KEY = 'isa_local_data_cache_v1';
        const LOCAL_DATA_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
        const MONTHLY_REPORT_CACHE_KEY = 'isa_monthly_report_cache_v1';
        const MONTHLY_REPORT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
        const PRICE_CACHE_URL = String(window.ISARICH_CONFIG?.priceCacheUrl || '').trim();

        let transactions = [];
        let pendingTransactions = new Map();
        let marketData = {};
        let assetChart = null;
        let totalBuyAmount = 0;
        let backgroundSyncTimer = null;

// ===== Chart Center Text Plugin =====
const centerTextPlugin = {
    id: 'centerText',
    beforeDraw(chart) {
        const {ctx, chartArea:{width, height}} = chart;
        ctx.save();
        ctx.font = 'bold 16px Pretendard';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const total = chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
        ctx.fillText('₩' + Math.round(total).toLocaleString(), width/2, height/2);
    }
};

        let selectedTicker = "";
        let historyFilterDays = 'all';
        let historyVisibleCount = 100;
        let monthlyBreakdownOpen = { buy: false, sell: false, dividend: false };
        const MONTHLY_BREAKDOWN_STATE_KEY = 'isa_monthly_breakdown_state';

        function loadMonthlyBreakdownState(monthKey) {
            try {
                const all = JSON.parse(localStorage.getItem(MONTHLY_BREAKDOWN_STATE_KEY) || '{}');
                const saved = all?.[monthKey];
                if (!saved || typeof saved !== 'object') return { buy: false, sell: false, dividend: false };
                return {
                    buy: Boolean(saved.buy),
                    sell: Boolean(saved.sell),
                    dividend: Boolean(saved.dividend)
                };
            } catch (e) {
                return { buy: false, sell: false, dividend: false };
            }
        }

        function saveMonthlyBreakdownState(monthKey, nextState) {
            if (!monthKey) return;
            try {
                const all = JSON.parse(localStorage.getItem(MONTHLY_BREAKDOWN_STATE_KEY) || '{}');
                all[monthKey] = {
                    buy: Boolean(nextState?.buy),
                    sell: Boolean(nextState?.sell),
                    dividend: Boolean(nextState?.dividend)
                };
                localStorage.setItem(MONTHLY_BREAKDOWN_STATE_KEY, JSON.stringify(all));
            } catch (e) {
                console.warn('Failed to persist monthly breakdown state.', e);
            }
        }
        let detailModalTicker = "";
        let detailModalName = "";
        let transactionsVersion = 0;
        let portfolioStateCacheVersion = -1;
        let portfolioStateCache = null;
        let currentMonthlyModeKey = "";
        const monthlyReportCache = new Map();
        let isSyncing = false;
        const storedLowPowerMode = localStorage.getItem('isa_low_power_mode');
        const isLikelyMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        let lowPowerMode = storedLowPowerMode ? storedLowPowerMode === '1' : isLikelyMobile;

        function isPlainObject(value) {
            return !!value && typeof value === 'object' && !Array.isArray(value);
        }

        function readJsonStorage(key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (e) {
                console.warn(`Failed to read ${key}.`, e);
                return fallback;
            }
        }

        function writeJsonStorage(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                console.warn(`Failed to write ${key}.`, e);
                return false;
            }
        }

        function invalidateMonthlyReportCaches(options = {}) {
            monthlyReportCache.clear();
            if (options.persisted) {
                try {
                    localStorage.removeItem(MONTHLY_REPORT_CACHE_KEY);
                } catch (e) {
                    console.warn('Failed to clear monthly report cache.', e);
                }
            }
        }

        function rememberMonthlyReport(report, options = {}) {
            const monthKey = String(report?.monthKey || '').trim();
            if (!monthKey) return report;

            monthlyReportCache.set(monthKey, report);
            if (!options.persist) return report;

            const cached = readJsonStorage(MONTHLY_REPORT_CACHE_KEY, {});
            const reports = isPlainObject(cached?.reports) ? cached.reports : {};
            reports[monthKey] = {
                savedAt: Date.now(),
                report
            };
            writeJsonStorage(MONTHLY_REPORT_CACHE_KEY, {
                savedAt: Date.now(),
                reports
            });
            return report;
        }

        function readPersistedMonthlyReport(monthKey) {
            const targetMonth = String(monthKey || '').trim();
            if (!targetMonth) return null;

            const cached = readJsonStorage(MONTHLY_REPORT_CACHE_KEY, null);
            const item = cached?.reports?.[targetMonth];
            const savedAt = Number(item?.savedAt || 0);
            if (!item?.report || !savedAt || Date.now() - savedAt > MONTHLY_REPORT_CACHE_MAX_AGE_MS) return null;
            return item.report;
        }

        function primeMonthlyReportFromTransactions(monthKey = currentMonthlyModeKey || getCurrentMonthKey()) {
            if (!monthKey) return null;
            return rememberMonthlyReport(getCurrentMonthReport(transactions, monthKey), { persist: true });
        }

        function saveLocalDataSnapshot() {
            writeJsonStorage(LOCAL_DATA_CACHE_KEY, {
                savedAt: Date.now(),
                transactions,
                marketData
            });
        }

        function restoreLocalDataSnapshot() {
            const cached = readJsonStorage(LOCAL_DATA_CACHE_KEY, null);
            const savedAt = Number(cached?.savedAt || 0);
            if (!savedAt || Date.now() - savedAt > LOCAL_DATA_CACHE_MAX_AGE_MS) return false;

            const cachedTransactions = Array.isArray(cached.transactions) ? cached.transactions.map((item) => toHistoryRecord(item, item.source || 'cache')) : [];
            const cachedMarketData = isPlainObject(cached.marketData) ? cached.marketData : {};

            if (!cachedTransactions.length && !Object.keys(cachedMarketData).length) return false;

            transactions = mergePendingTransactions(cachedTransactions);
            marketData = cachedMarketData;
            transactionsVersion += 1;
            invalidateMonthlyReportCaches();
            primeMonthlyReportFromTransactions();
            updateUI();
            updateQuickSelectUI();
            updateDividendTickerOptions();
            setSyncStatus('저장된 데이터 표시 중...');
            return true;
        }

        function getPriceRequestUrl() {
            const baseUrl = PRICE_CACHE_URL || sheetsUrl;
            if (!baseUrl) return '';

            try {
                const url = new URL(baseUrl, window.location.href);
                if (!PRICE_CACHE_URL) {
                    url.searchParams.set('action', 'prices');
                    url.searchParams.set('_t', String(Date.now()));
                } else {
                    url.searchParams.set('v', String(Math.floor(Date.now() / 300000)));
                }
                return url.toString();
            } catch (e) {
                console.warn('Invalid price request URL.', e);
                return '';
            }
        }

        function normalizePricePayload(payload) {
            if (isPlainObject(payload?.data)) return payload.data;
            return isPlainObject(payload) ? payload : {};
        }

        async function loadPriceData() {
            const url = getPriceRequestUrl();
            if (!url) throw new Error('PRICE_URL_MISSING');
            return normalizePricePayload(await fetchJsonWithTimeout(url, { redirect: 'follow' }));
        }

        function scheduleBackgroundSync(reason = 'background') {
            if (backgroundSyncTimer) clearTimeout(backgroundSyncTimer);
            backgroundSyncTimer = setTimeout(() => {
                backgroundSyncTimer = null;
                syncAllData().catch((e) => {
                    setSyncFailureStatus(reason.toUpperCase(), e, reason.toUpperCase());
                });
            }, 700);
        }

        // 엔진 레벨: 5,000원 단위 · 먹거리 미션 (최대 100,000원)
        function getDividendLevels() {
            return [
                { icon: "🥚", text: "계란 한 판 스타트" },
                { icon: "☕", text: "메가커피 아아 1잔" },
                { icon: "🌭", text: "편의점 핫바+콜라" },
                { icon: "🍔", text: "맘스터치 싸이버거 세트" },
                { icon: "🍜", text: "신라면+삼각김밥+계란" },
                { icon: "🍗", text: "BHC 뿌링클 반마리권" },
                { icon: "🍕", text: "도미노 피자 L 1판권" },
                { icon: "🥩", text: "소갈비살 1인분" },
                { icon: "🍣", text: "연어초밥 세트" },
                { icon: "🥘", text: "곱창전골 1회전" },
                { icon: "🍖", text: "삼겹살 2인분" },
                { icon: "🍤", text: "새우튀김+우동 세트" },
                { icon: "🌮", text: "타코 3피스 세트" },
                { icon: "🍲", text: "부대찌개 2인 세트" },
                { icon: "🍝", text: "파스타+스테이크 런치" },
                { icon: "🍱", text: "초밥 오마카세 라이트" },
                { icon: "🐟", text: "방어회 소자" },
                { icon: "🍞", text: "두찜 로제찜닭 + 치즈볼" },
                { icon: "🥓", text: "한우 국밥 + 육회" },
                { icon: "🚀", text: "치킨+피자+햄버거 풀세트" }
            ];
        }

        function getDividendLevel(amount) {
            const FOOD_LEVELS = getDividendLevels();
            const safeAmount = Math.max(0, Number(amount) || 0);
            const index = Math.min(Math.floor(safeAmount / 5000), FOOD_LEVELS.length - 1);
            return FOOD_LEVELS[index];
        }

        function getNextDividendMilestone(amount) {
            const FOOD_LEVELS = getDividendLevels();
            const safeAmount = Math.max(0, Number(amount) || 0);
            const index = Math.min(Math.floor(safeAmount / 5000), FOOD_LEVELS.length - 1);
            if (index >= FOOD_LEVELS.length - 1) {
                return { isMax: true, text: '최고 레벨 달성!', remaining: 0, icon: FOOD_LEVELS[index].icon };
            }
            const nextIndex = index + 1;
            const targetAmount = nextIndex * 5000;
            const remaining = Math.max(0, targetAmount - safeAmount);
            return { isMax: false, text: FOOD_LEVELS[nextIndex].text, remaining, icon: FOOD_LEVELS[nextIndex].icon };
        }

        const DEFAULT_FIREBASE_CONFIG = {
            apiKey: "AIzaSyDSM1J3EJyS7RLsbKsoGOeRwWKD_zrFvIY",
            authDomain: "isa-rich.firebaseapp.com",
            projectId: "isa-rich",
            storageBucket: "isa-rich.firebasestorage.app",
            messagingSenderId: "939183113968",
            appId: "1:939183113968:web:84a9773b3fdda76529a435"
        };

        let sheetsUrl = MY_GAS_URL;
        let firebaseConfigRaw = JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2);
        let firebaseCollection = 'isa_history';
        let firestoreDb = null;
        let firebaseAuth = null;
        let firebaseUser = null;

        function isValidSheetsUrl(url) {
            if (!url) return false;
            try {
                const parsed = new URL(url);
                return parsed.protocol === 'https:' && parsed.hostname === 'script.google.com' && parsed.pathname.startsWith('/macros/s/');
            } catch (e) {
                return false;
            }
        }

        function parseFirebaseConfig(raw) {
            if(!raw) return null;
            try {
                const parsed = JSON.parse(raw);
                if(!parsed || typeof parsed !== 'object' || !parsed.projectId) return null;
                return parsed;
            } catch (e) {
                return null;
            }
        }

        function normalizeCashCategory(raw) {
            const value = String(raw ?? '').trim();
            const lower = value.toLowerCase();
            const numeric = Number(value);

            if (!Number.isNaN(numeric)) {
                if (numeric === 1) return '1';
                if (numeric === 2) return '2';
                if (numeric === 3) return '3';
            }

            if (value === '1' || value === '원금' || lower === 'base' || lower === 'principal') return '1';
            if (value === '2' || value === '특별' || value === '특별금' || lower === 'special' || lower === 'bonus') return '2';
            if (value === '3' || value === '배당' || value === '배당금' || lower === 'dividend' || lower === 'reinvest' || value === '재투자') return '3';
            return '1';
        }

        function normalizeTransactionCategory(raw) {
            const value = String(raw ?? '').trim();
            const lower = value.toLowerCase();
            const numeric = Number(value);
            if (!Number.isNaN(numeric) && numeric === 0) return '0';
            if (value === '0' || lower === 'trade' || lower === 'stock') return '0';
            return normalizeCashCategory(raw);
        }

        function getExplicitTradeSide(tx) {
            const sideRaw = String(tx?.side || tx?.type || '').trim().toLowerCase();
            if (['buy', '매수', 'purchase'].includes(sideRaw)) return 'buy';
            if (['sell', '매도'].includes(sideRaw)) return 'sell';
            const shares = Number(tx?.shares || 0);
            if (shares < 0) return 'sell';
            return '';
        }

        function isDepositTransaction(tx) {
            const ticker = String(tx?.ticker || '').trim().toUpperCase();
            const explicitSide = getExplicitTradeSide(tx);
            if (explicitSide) return false;

            if (['DEPOSIT', 'CASH', 'CASH_DEPOSIT', '입금'].includes(ticker)) return true;

            const name = String(tx?.name || '').trim();
            const cat = normalizeCashCategory(tx?.category);
            if (!(name.includes('입금') || name.includes('충전'))) return false;
            if (!ticker && ['1', '2', '3'].includes(cat)) return true;
            return cat === '3' && name.includes('배당');
        }

        function getTradeDisplayName(tx) {
            const ticker = String(tx?.ticker || '').trim();
            const rawName = String(tx?.name || '').trim();
            const marketName = ticker ? String(marketData?.[ticker]?.name || '').trim() : '';
            if (!isDepositTransaction(tx) && (rawName.includes('입금') || rawName.includes('충전'))) {
                const stripped = rawName
                    .replace(/\s*배당\s*입금\s*/g, '')
                    .replace(/\s*현금\s*입금\s*/g, '')
                    .replace(/\s*원금\s*입금\s*/g, '')
                    .replace(/\s*특별\s*입금\s*/g, '')
                    .trim();
                return marketName || stripped || ticker || rawName;
            }
            return rawName || marketName || ticker;
        }

        function roundShares(value) {
            const n = Number(value || 0);
            if (!Number.isFinite(n)) return 0;
            return Math.round(n * 10000) / 10000;
        }

        function roundMoney(value) {
            const n = Number(value || 0);
            if (!Number.isFinite(n)) return 0;
            return Math.round(n * 100) / 100;
        }

        function getSortedTransactions(inputTransactions) {
            return [...(inputTransactions || [])].sort((a, b) => {
                const dateDiff = new Date(a.date) - new Date(b.date);
                if (dateDiff !== 0) return dateDiff;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
        }

        function createTxnId() {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
            return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
        }

        function simulatePortfolioState(inputTransactions) {
            const sortedTx = getSortedTransactions(inputTransactions);

            const cash = { "1": 0, "2": 0, "3": 0 };
            const chargedByCat = { "1": 0, "2": 0, "3": 0 };
            const buyUsedByCat = { "1": 0, "2": 0, "3": 0 };
            const holdings = {};
            let totalBuyAmount = 0;

            sortedTx.forEach((tx) => {
                const shares = roundShares(tx?.shares || 0);
                const price = Number(tx?.price || 0);
                if (!Number.isFinite(price) || price <= 0) return;
                const amt = roundMoney(Math.abs(shares * price));

                if (isDepositTransaction(tx)) {
                    const cat = normalizeCashCategory(tx?.category);
                    cash[cat] = roundMoney(cash[cat] + amt);
                    chargedByCat[cat] = roundMoney(chargedByCat[cat] + amt);
                    return;
                }

                const ticker = String(tx?.ticker || '').trim();
                if (!ticker || shares === 0) return;
                if (!holdings[ticker]) {
                    holdings[ticker] = { shares: 0, cost: 0, name: getTradeDisplayName(tx), alloc: { "1": 0, "2": 0, "3": 0 } };
                }
                const h = holdings[ticker];

                if (shares > 0) {
                    totalBuyAmount = roundMoney(totalBuyAmount + amt);
                    h.shares = roundShares(h.shares + shares);
                    h.cost = roundMoney(h.cost + amt);

                    let remain = amt;
                    ['3', '2', '1'].forEach(cat => {
                        if (remain <= 0) return;
                        const usable = Math.max(0, cash[cat]);
                        const used = Math.min(usable, remain);
                        cash[cat] = roundMoney(cash[cat] - used);
                        h.alloc[cat] = roundMoney(h.alloc[cat] + used);
                        buyUsedByCat[cat] = roundMoney(buyUsedByCat[cat] + used);
                        remain = roundMoney(remain - used);
                    });
                    if (remain > 0) {
                        cash['1'] = roundMoney(cash['1'] - remain);
                        h.alloc['1'] = roundMoney(h.alloc['1'] + remain);
                        buyUsedByCat['1'] = roundMoney(buyUsedByCat['1'] + remain);
                    }
                    return;
                }

                const sellQty = Math.abs(shares);
                if (h.shares <= 0) return;
                const actualSellQty = Math.min(sellQty, h.shares);
                const proceeds = roundMoney(actualSellQty * price);
                const avgCost = h.shares > 0 ? h.cost / h.shares : 0;
                const costBasisSold = roundMoney(actualSellQty * avgCost);
                const realizedPnl = roundMoney(proceeds - costBasisSold);

                h.shares = roundShares(h.shares - actualSellQty);
                h.cost = roundMoney(Math.max(0, h.cost - costBasisSold));

                let remainCost = costBasisSold;
                const recovered = { "1": 0, "2": 0, "3": 0 };
                ['3', '2', '1'].forEach(cat => {
                    if (remainCost <= 0) return;
                    const fromCat = Math.min(h.alloc[cat], remainCost);
                    h.alloc[cat] = roundMoney(h.alloc[cat] - fromCat);
                    recovered[cat] = roundMoney(recovered[cat] + fromCat);
                    remainCost = roundMoney(remainCost - fromCat);
                });
                if (remainCost > 0) recovered['1'] = roundMoney(recovered['1'] + remainCost);

                ['1', '2', '3'].forEach(cat => {
                    cash[cat] = roundMoney(cash[cat] + recovered[cat]);
                });

                if (realizedPnl >= 0) {
                    cash['3'] = roundMoney(cash['3'] + realizedPnl);
                } else {
                    const loss = Math.abs(realizedPnl);
                    const recoveredTotal = recovered['1'] + recovered['2'] + recovered['3'];
                    if (recoveredTotal > 0) {
                        ['1', '2', '3'].forEach(cat => {
                            const ratio = recovered[cat] / recoveredTotal;
                            cash[cat] = roundMoney(cash[cat] - (loss * ratio));
                        });
                    } else {
                        cash['1'] = roundMoney(cash['1'] - loss);
                    }
                }
            });

            return { cash, chargedByCat, buyUsedByCat, holdings, totalBuyAmount };
        }

        function getPortfolioState() {
            if (portfolioStateCache && portfolioStateCacheVersion === transactionsVersion) {
                return portfolioStateCache;
            }
            portfolioStateCache = simulatePortfolioState(transactions);
            portfolioStateCacheVersion = transactionsVersion;
            return portfolioStateCache;
        }

        function getMonthKey(dateLike) {
            const d = new Date(String(dateLike || ''));
            if (Number.isNaN(d.getTime())) return '';
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }

        function getCurrentMonthKey() {
            return getMonthKey(getLocalDateInputValue());
        }

        function shiftMonthKey(baseMonthKey, delta) {
            const normalized = String(baseMonthKey || '').trim();
            const [y, m] = normalized.split('-').map(Number);
            if (!y || !m) return getMonthKey(getLocalDateInputValue());
            const d = new Date(y, (m - 1) + Number(delta || 0), 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }

        async function loadMonthlyReportFromFirebase(monthKey) {
            if (!monthKey) return null;
            if (monthlyReportCache.has(monthKey)) return monthlyReportCache.get(monthKey);
            const persistedReport = readPersistedMonthlyReport(monthKey);
            if (persistedReport) {
                monthlyReportCache.set(monthKey, persistedReport);
                return persistedReport;
            }
            if (!firestoreDb) return null;

            const [y, m] = String(monthKey).split('-').map(Number);
            if (!y || !m) return null;
            const monthEnd = new Date(y, m, 0);
            const monthEndKey = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
            const maxDocs = HISTORY_FETCH_PAGE_SIZE * HISTORY_FETCH_MAX_PAGES;

            try {
                const docs = [];
                let lastDoc = null;
                let pageCount = 0;
                while (pageCount < HISTORY_FETCH_MAX_PAGES) {
                    let query = firestoreDb
                        .collection(firebaseCollection)
                        .where('date', '<=', monthEndKey)
                        .orderBy('date', 'desc')
                        .limit(HISTORY_FETCH_PAGE_SIZE);
                    if (lastDoc) query = query.startAfter(lastDoc);

                    const snap = await query.get();
                    if (!snap || snap.empty) break;
                    docs.push(...snap.docs);
                    pageCount += 1;
                    lastDoc = snap.docs[snap.docs.length - 1];
                    if (snap.size < HISTORY_FETCH_PAGE_SIZE || docs.length >= maxDocs) break;
                }
                const records = docs.slice(0, maxDocs).map(doc => toHistoryRecord({ id: doc.id, ...(doc.data() || {}) }, 'firebase'));
                const report = getCurrentMonthReport(records, monthKey);
                return rememberMonthlyReport(report, { persist: true });
            } catch (e) {
                console.warn('Monthly report firebase query failed. Falling back to local transactions.', e);
                return readPersistedMonthlyReport(monthKey);
            }
        }

        function getCurrentMonthReport(inputTransactions, targetMonthKey = '') {
            const monthKey = targetMonthKey || getMonthKey(getLocalDateInputValue());
            const sortedTx = getSortedTransactions(inputTransactions);

            const cash = { "1": 0, "2": 0, "3": 0 };
            const holdings = {};
            let realizedPnl = 0;
            let dividendIn = 0;
            let dividendUsed = 0;
            let buyActionCount = 0;
            let buyShares = 0;
            let buyAmount = 0;
            let sellActionCount = 0;
            let sellShares = 0;
            let sellAmount = 0;
            let sellCostBasis = 0;
            let unassignedDividendCount = 0;
            const tickerMonthlyStats = {};

            sortedTx.forEach((tx) => {
                const txMonth = getMonthKey(tx?.date);
                const shares = roundShares(tx?.shares || 0);
                const price = Number(tx?.price || 0);
                if (!Number.isFinite(price) || price <= 0) return;
                const amt = roundMoney(Math.abs(shares * price));
                const ticker = String(tx?.ticker || '').trim();
                const tickerName = String(tx?.name || ticker).trim() || ticker;

                if (txMonth === monthKey && ticker && !isDepositTransaction(tx)) {
                    if (!tickerMonthlyStats[ticker]) {
                        tickerMonthlyStats[ticker] = {
                            ticker,
                            name: tickerName,
                            dividendIn: 0,
                            buyShares: 0,
                            buyAmount: 0,
                            sellShares: 0,
                            sellAmount: 0,
                            sellCostBasis: 0,
                            realizedPnl: 0
                        };
                    }
                }

                if (isDepositTransaction(tx)) {
                    const cat = normalizeCashCategory(tx?.category);
                    cash[cat] = roundMoney(cash[cat] + amt);
                    if (txMonth === monthKey && cat === '3') {
                        dividendIn = roundMoney(dividendIn + amt);
                        const dividendTicker = ticker || 'DIVIDEND';
                        if (!ticker || ticker === 'DEPOSIT') unassignedDividendCount += 1;
                        if (!tickerMonthlyStats[dividendTicker]) {
                            tickerMonthlyStats[dividendTicker] = {
                                ticker: dividendTicker,
                                name: String(tx?.name || '배당 입금').trim() || '배당 입금',
                                dividendIn: 0,
                                buyShares: 0,
                                buyAmount: 0,
                                sellShares: 0,
                                sellAmount: 0,
                                sellCostBasis: 0,
                                realizedPnl: 0
                            };
                        }
                        tickerMonthlyStats[dividendTicker].dividendIn = roundMoney(tickerMonthlyStats[dividendTicker].dividendIn + amt);
                    }
                    return;
                }

                if (!ticker || shares === 0) return;
                if (!holdings[ticker]) holdings[ticker] = { shares: 0, cost: 0 };
                const h = holdings[ticker];
                const tickerStat = tickerMonthlyStats[ticker];

                if (shares > 0) {
                    if (txMonth === monthKey) buyActionCount += 1;
                    if (txMonth === monthKey) {
                        buyShares = roundShares(buyShares + shares);
                        buyAmount = roundMoney(buyAmount + amt);
                        if (tickerStat) {
                            tickerStat.buyShares = roundShares(tickerStat.buyShares + shares);
                            tickerStat.buyAmount = roundMoney(tickerStat.buyAmount + amt);
                        }
                    }
                    h.shares = roundShares(h.shares + shares);
                    h.cost = roundMoney(h.cost + amt);

                    let remain = amt;
                    ['3', '2', '1'].forEach(cat => {
                        if (remain <= 0) return;
                        const usable = Math.max(0, cash[cat]);
                        const used = Math.min(usable, remain);
                        cash[cat] = roundMoney(cash[cat] - used);
                        remain = roundMoney(remain - used);
                        if (txMonth === monthKey && cat === '3') {
                            dividendUsed = roundMoney(dividendUsed + used);
                        }
                    });
                    if (remain > 0) cash['1'] = roundMoney(cash['1'] - remain);
                    return;
                }

                const sellQty = Math.abs(shares);
                if (h.shares <= 0) return;
                const actualSellQty = Math.min(sellQty, h.shares);
                const proceeds = roundMoney(actualSellQty * price);
                const avgCost = h.shares > 0 ? h.cost / h.shares : 0;
                const costBasisSold = roundMoney(actualSellQty * avgCost);
                const pnl = roundMoney(proceeds - costBasisSold);
                if (txMonth === monthKey) {
                    sellActionCount += 1;
                    sellShares = roundShares(sellShares + actualSellQty);
                    sellAmount = roundMoney(sellAmount + proceeds);
                    sellCostBasis = roundMoney(sellCostBasis + costBasisSold);
                    if (tickerStat) {
                        tickerStat.sellShares = roundShares(tickerStat.sellShares + actualSellQty);
                        tickerStat.sellAmount = roundMoney(tickerStat.sellAmount + proceeds);
                        tickerStat.sellCostBasis = roundMoney(tickerStat.sellCostBasis + costBasisSold);
                        tickerStat.realizedPnl = roundMoney(tickerStat.realizedPnl + pnl);
                    }
                }

                h.shares = roundShares(h.shares - actualSellQty);
                h.cost = roundMoney(Math.max(0, h.cost - costBasisSold));
                if (txMonth === monthKey) realizedPnl = roundMoney(realizedPnl + pnl);
            });

            const monthlyBase = Math.max(1, roundMoney(buyAmount + sellCostBasis));
            const totalReturnAmount = roundMoney(realizedPnl + dividendIn);
            const monthlyTotalReturnRate = ((realizedPnl + dividendIn) / monthlyBase) * 100;
            const tickerBreakdown = Object.values(tickerMonthlyStats)
                .filter(item => item.dividendIn > 0 || item.buyShares > 0 || item.sellShares > 0)
                .map(item => ({
                    ...item,
                    avgBuyPrice: item.buyShares > 0 ? roundMoney(item.buyAmount / item.buyShares) : 0,
                    avgSellPrice: item.sellShares > 0 ? roundMoney(item.sellAmount / item.sellShares) : 0,
                    realizedReturnRate: item.sellCostBasis > 0 ? (item.realizedPnl / item.sellCostBasis) * 100 : 0
                }))
                .sort((a, b) => (b.dividendIn + b.buyAmount + b.sellAmount) - (a.dividendIn + a.buyAmount + a.sellAmount));

            return {
                monthKey,
                realizedPnl,
                dividendIn,
                dividendUsed,
                buyActionCount,
                buyShares,
                buyAmount,
                sellActionCount,
                sellShares,
                sellAmount,
                totalReturnAmount,
                monthlyTotalReturnRate,
                unassignedDividendCount,
                tickerBreakdown
            };
        }

        function updateMonthlyReviewPanel(monthReport) {
            const panel = getEl('monthly-review-panel');
            if (!panel) return;
            safeSetText('monthly-review-badge', ENABLE_MONTHLY_REVIEW_MODE ? 'ON' : 'OFF');

            if (!ENABLE_MONTHLY_REVIEW_MODE) {
                panel.classList.add('hidden');
                return;
            }
            panel.classList.remove('hidden');

            const buyItems = (monthReport.tickerBreakdown || []).filter(item => Number(item.buyShares || 0) > 0);
            const sellItems = (monthReport.tickerBreakdown || []).filter(item => Number(item.sellShares || 0) > 0);
            const dividendItems = (monthReport.tickerBreakdown || []).filter(item => Number(item.dividendIn || 0) > 0);

            safeSetText('monthly-check-buy-action', `${monthReport.buyShares.toFixed(2)}주 · ₩${Math.round(monthReport.buyAmount).toLocaleString()} ${monthlyBreakdownOpen.buy ? '▴' : '▾'}`);
            safeSetText('monthly-check-sell-action', `${monthReport.sellShares.toFixed(2)}주 · ₩${Math.round(monthReport.sellAmount).toLocaleString()} ${monthlyBreakdownOpen.sell ? '▴' : '▾'}`);
            safeSetText('monthly-check-dividend-total', `₩${Math.round(monthReport.dividendIn || 0).toLocaleString()} ${monthlyBreakdownOpen.dividend ? '▴' : '▾'}`);
            const unassignedBadge = getEl('monthly-unassigned-badge');
            if (unassignedBadge) {
                const count = Number(monthReport.unassignedDividendCount || 0);
                unassignedBadge.classList.toggle('hidden', count <= 0);
                if (count > 0) unassignedBadge.innerText = `미지정 ${count}건`;
            }

            const setBreakdown = (id, open, items, lineRenderer, emptyText) => {
                const box = getEl(id);
                if (!box) return;
                box.classList.toggle('hidden', !open);
                if (!open) return;
                box.innerHTML = items.length
                    ? items.map(lineRenderer).join('')
                    : `<p class="text-[10px] font-black text-slate-400">${emptyText}</p>`;
            };

            setBreakdown(
                'monthly-breakdown-buy',
                monthlyBreakdownOpen.buy,
                buyItems,
                (item) => `<div class="flex justify-between items-center gap-2 text-[10px]">
                        <p class="font-black text-slate-600 truncate">${escapeHtml(item.name || item.ticker)}</p>
                        <p class="font-black text-slate-500">${Number(item.buyShares || 0).toFixed(2)}주 · 평균 ₩${Math.round(item.avgBuyPrice || 0).toLocaleString()}</p>
                    </div>`,
                '이 달 매수 내역이 없습니다.'
            );
            setBreakdown(
                'monthly-breakdown-sell',
                monthlyBreakdownOpen.sell,
                sellItems,
                (item) => `<div class="flex justify-between items-center gap-2 text-[10px]">
                        <p class="font-black text-slate-600 truncate">${escapeHtml(item.name || item.ticker)}</p>
                        <p class="font-black text-slate-500">${Number(item.sellShares || 0).toFixed(2)}주 · 평균 ₩${Math.round(item.avgSellPrice || 0).toLocaleString()}</p>
                    </div>`,
                '이 달 매도 내역이 없습니다.'
            );
            setBreakdown(
                'monthly-breakdown-dividend',
                monthlyBreakdownOpen.dividend,
                dividendItems,
                (item) => `<div class="flex justify-between items-center gap-2 text-[10px]">
                        <p class="font-black text-slate-600 truncate">${escapeHtml(item.name || item.ticker)}</p>
                        <p class="font-black text-slate-500">₩${Math.round(item.dividendIn || 0).toLocaleString()}</p>
                    </div>`,
                '이 달 배당 유입 내역이 없습니다.'
            );

            const reviewNote = `이번 달 총합 수익 ₩${Math.round(monthReport.totalReturnAmount || 0).toLocaleString()} · 배당 유입 ₩${Math.round(monthReport.dividendIn).toLocaleString()} · 매수 ${monthReport.buyActionCount}회 / 매도 ${monthReport.sellActionCount}회`;
            safeSetText('monthly-review-note', reviewNote);
        }

        function getHoldingSharesByTicker(ticker) {
            const targetTicker = String(ticker || '').trim();
            if (!targetTicker) return 0;
            const state = getPortfolioState();
            return roundShares(state.holdings?.[targetTicker]?.shares || 0);
        }

        function getOpenPositionCostBasis(holdings) {
            return Object.values(holdings || {}).reduce((sum, item) => {
                if (!item || Number(item.shares || 0) <= 0) return sum;
                return roundMoney(sum + Number(item.cost || 0));
            }, 0);
        }

        function updateAuthStatus(text) {
            safeSetText('auth-status', text);
        }

        async function ensureFirebaseAuth() {
            if (!firebaseAuth || typeof firebaseAuth.signInAnonymously !== 'function') {
                updateAuthStatus('인증 SDK 없음 · 기존 연결 모드');
                return true;
            }

            try {
                if (firebaseAuth.currentUser) {
                    firebaseUser = firebaseAuth.currentUser;
                    updateAuthStatus(`인증됨 · UID ${firebaseUser.uid}`);
                    return true;
                }

                const credential = await firebaseAuth.signInAnonymously();
                firebaseUser = credential?.user || firebaseAuth.currentUser || null;
                updateAuthStatus(firebaseUser ? `인증됨 · UID ${firebaseUser.uid}` : '인증됨');
                return true;
            } catch (e) {
                firebaseUser = null;
                updateAuthStatus('익명 인증 실패 · 기존 규칙이면 계속 동작');
                console.info('Firebase anonymous auth is not active. Continuing with the current Firestore rules.', e);
                return false;
            }
        }

        function initFirebase() {
            if (typeof firebase === 'undefined' || !firebase?.initializeApp) {
                console.warn('Firebase SDK is not available.');
                firestoreDb = null;
                firebaseAuth = null;
                firebaseUser = null;
                updateAuthStatus('Firebase SDK 없음');
                return false;
            }

            const parsed = parseFirebaseConfig(firebaseConfigRaw);
            const candidates = [parsed, DEFAULT_FIREBASE_CONFIG].filter(Boolean);

            for (const config of candidates) {
                try {
                    const appName = `isa-rich-${config.projectId}`;
                    const app = firebase.apps.find(a => a.name === appName) || firebase.initializeApp(config, appName);
                    firestoreDb = app.firestore();
                    firebaseAuth = typeof app.auth === 'function' ? app.auth() : null;
                    firebaseUser = firebaseAuth?.currentUser || null;
                    updateAuthStatus(firebaseAuth ? '인증 준비 완료' : '인증 SDK 없음 · 기존 연결 모드');

                    if (!parsed || parsed.projectId !== config.projectId) {
                        firebaseConfigRaw = JSON.stringify(config, null, 2);
                        localStorage.setItem('isa_firebase_config', firebaseConfigRaw);
                    }
                    return true;
                } catch (e) {
                    console.error(e);
                }
            }

            firestoreDb = null;
            firebaseAuth = null;
            firebaseUser = null;
            updateAuthStatus('Firebase 연결 실패');
            return false;
        }

        function toHistoryRecord(item, source = 'firebase') {
            const createdAtRaw = item?.createdAt ?? item?.createdAtMs;
            const createdAtMs = (() => {
                if (typeof createdAtRaw?.toMillis === 'function') return Number(createdAtRaw.toMillis());
                if (createdAtRaw && typeof createdAtRaw.seconds === 'number') return Number(createdAtRaw.seconds) * 1000;
                const asNum = Number(createdAtRaw);
                if (!Number.isNaN(asNum) && asNum > 0) return asNum;
                return 0;
            })();

            return {
                id: String(item.id ?? Date.now()),
                date: String(item.date || '').substring(0, 10),
                ticker: String(item.ticker || ''),
                name: String(item.name || ''),
                shares: Number(item.shares || 0),
                price: Number(item.price || 0),
                category: normalizeTransactionCategory(item.category),
                side: String(item.side || item.type || '').trim(),
                createdAtMs,
                source
            };
        }

        function hasTransaction(id) {
            const safeId = String(id || '');
            return !!safeId && transactions.some(tx => String(tx.id) === safeId);
        }

        function persistPendingTransactions() {
            try {
                localStorage.setItem(PENDING_TX_STORAGE_KEY, JSON.stringify([...pendingTransactions.values()]));
            } catch (_) {}
        }

        function restorePendingTransactions() {
            try {
                const raw = JSON.parse(localStorage.getItem(PENDING_TX_STORAGE_KEY) || '[]');
                pendingTransactions = new Map();
                (Array.isArray(raw) ? raw : []).forEach(item => {
                    const record = toHistoryRecord(item, 'pending');
                    if(record.id && record.date && record.ticker) {
                        pendingTransactions.set(String(record.id), record);
                    }
                });
            } catch (_) {
                pendingTransactions = new Map();
            }
        }

        function trackPendingTransaction(record) {
            if(!record?.id) return;
            pendingTransactions.set(String(record.id), record);
            persistPendingTransactions();
        }

        function clearPendingTransaction(id) {
            const safeId = String(id || '');
            if(!safeId) return;
            if(pendingTransactions.delete(safeId)) persistPendingTransactions();
        }

        function mergePendingTransactions(loadedTransactions) {
            const merged = [...(loadedTransactions || [])];
            const loadedIds = new Set(merged.map(tx => String(tx.id || '')));
            let changedPending = false;

            pendingTransactions.forEach((record, id) => {
                if(loadedIds.has(String(id))) {
                    pendingTransactions.delete(String(id));
                    changedPending = true;
                } else {
                    merged.unshift(record);
                }
            });

            if(changedPending) persistPendingTransactions();
            return merged;
        }

        function removeLocalTransaction(id) {
            const safeId = String(id || '');
            if(!safeId) return;
            clearPendingTransaction(safeId);
            transactions = transactions.filter(tx => String(tx.id) !== safeId);
            transactionsVersion += 1;
            invalidateMonthlyReportCaches({ persisted: true });
            updateUI();
            updateQuickSelectUI();
            updateDividendTickerOptions();
        }

        function upsertLocalTransaction(payload, id, source = 'pending') {
            const safeId = String(id || payload?.id || createTxnId());
            const record = toHistoryRecord({
                ...payload,
                id: safeId,
                createdAtMs: Date.now()
            }, source);
            transactions = [
                record,
                ...transactions.filter(tx => String(tx.id) !== safeId)
            ];
            transactionsVersion += 1;
            invalidateMonthlyReportCaches({ persisted: true });
            updateUI();
            updateQuickSelectUI();
            updateDividendTickerOptions();
            if(source === 'pending') trackPendingTransaction(record);
            else clearPendingTransaction(safeId);
            return record;
        }

        async function syncAfterAdd(payload, id) {
            const record = upsertLocalTransaction(payload, id, 'pending');
            primeMonthlyReportFromTransactions();
            saveLocalDataSnapshot();
            setSyncStatus('저장 완료 · 백그라운드 동기화 중...');
            scheduleBackgroundSync('after-save');
            return record;
        }

        async function loadTransactionsFromFirebase() {
            if(!firestoreDb) throw new Error('파이어베이스 설정이 필요합니다.');
            const maxDocs = HISTORY_FETCH_PAGE_SIZE * HISTORY_FETCH_MAX_PAGES;
            const loadAllByQuery = async ({ firstQuery, nextQuery }) => {
                const docs = [];
                let lastDoc = null;
                let pageCount = 0;

                while (pageCount < HISTORY_FETCH_MAX_PAGES) {
                    const query = lastDoc ? nextQuery(lastDoc) : firstQuery();
                    const snap = await withTimeout(query.get(), 15000, '기록 조회');
                    if (!snap || snap.empty) break;
                    docs.push(...snap.docs);
                    pageCount += 1;
                    lastDoc = snap.docs[snap.docs.length - 1];
                    if (snap.size < HISTORY_FETCH_PAGE_SIZE || docs.length >= maxDocs) break;
                }
                return docs.slice(0, maxDocs);
            };

            let docs = [];
            try {
                docs = await loadAllByQuery({
                    firstQuery: () => firestoreDb.collection(firebaseCollection).orderBy('date', 'desc').limit(HISTORY_FETCH_PAGE_SIZE),
                    nextQuery: (lastDoc) => firestoreDb.collection(firebaseCollection).orderBy('date', 'desc').startAfter(lastDoc).limit(HISTORY_FETCH_PAGE_SIZE)
                });
            } catch (e) {
                console.warn('Date-ordered history query failed, using documentId pagination fallback.', e);
                const docIdField = firebase?.firestore?.FieldPath?.documentId?.();
                if (!docIdField) throw e;
                docs = await loadAllByQuery({
                    firstQuery: () => firestoreDb.collection(firebaseCollection).orderBy(docIdField).limit(HISTORY_FETCH_PAGE_SIZE),
                    nextQuery: (lastDoc) => firestoreDb.collection(firebaseCollection).orderBy(docIdField).startAfter(lastDoc.id).limit(HISTORY_FETCH_PAGE_SIZE)
                });
            }
            return docs.map(doc => toHistoryRecord({ id: doc.id, ...(doc.data() || {}) }, 'firebase'));
        }

        async function addTransactionToFirebase(payload) {
            if(!firestoreDb) throw new Error('파이어베이스 설정이 필요합니다.');
            const id = String(payload.id ?? Date.now());
            const keepCreatedAtMs = Number(payload.keepCreatedAtMs || 0);
            const createdAtValue = keepCreatedAtMs > 0
                ? firebase.firestore.Timestamp.fromMillis(keepCreatedAtMs)
                : firebase.firestore.FieldValue.serverTimestamp();
            const doc = {
                date: payload.date,
                ticker: String(payload.ticker || ''),
                name: String(payload.name || ''),
                shares: Number(payload.shares || 0),
                price: Number(payload.price || 0),
                category: normalizeTransactionCategory(payload.category),
                createdAt: createdAtValue
            };
            if(payload.side) doc.side = String(payload.side);
            if(payload.type) doc.type = String(payload.type);
            await firestoreDb.collection(firebaseCollection).doc(id).set(doc);
            return id;
        }

        async function deleteTransactionFromFirebase(id) {
            if(!firestoreDb) throw new Error('파이어베이스 설정이 필요합니다.');
            await firestoreDb.collection(firebaseCollection).doc(String(id)).delete();
            return 'ok';
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                return await fetch(url, { ...options, signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }
        }

        function withTimeout(promise, timeoutMs = 15000, label = '요청') {
            let timer = null;
            const timeoutPromise = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} 시간 초과`)), timeoutMs);
            });
            return Promise.race([promise, timeoutPromise]).finally(() => {
                if (timer) clearTimeout(timer);
            });
        }

        async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
            const response = await fetchWithTimeout(url, options, timeoutMs);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const text = await response.text();
            return JSON.parse(text || "{}");
        }

        function getLocalDateInputValue() {
            const now = new Date();
            const offsetMs = now.getTimezoneOffset() * 60000;
            return new Date(now.getTime() - offsetMs).toISOString().split('T')[0];
        }

        function getEl(id) { return document.getElementById(id); }
        function getTrendVisual(rate) {
            const n = Number(rate || 0);
            if (n >= 75) return { iconHtml: '<i class="fa-solid fa-fire"></i><i class="fa-solid fa-rocket ml-1"></i>', lightTextClass: 'text-red-500', darkTextClass: 'text-red-300' };
            if (n >= 50) return { iconHtml: '<i class="fa-solid fa-mountain ml-[1px]"></i><i class="fa-solid fa-fire-flame-curved ml-1"></i>', lightTextClass: 'text-red-500', darkTextClass: 'text-red-300' };
            if (n >= 30) return { iconHtml: '<i class="fa-solid fa-fire-flame-curved"></i>', lightTextClass: 'text-red-500', darkTextClass: 'text-red-300' };
            if (n >= 15) return { iconHtml: '<i class="fa-solid fa-fire"></i>', lightTextClass: 'text-red-500', darkTextClass: 'text-red-300' };
            if (n >= 5) return { iconHtml: '<i class="fa-solid fa-bolt"></i>', lightTextClass: 'text-red-500', darkTextClass: 'text-red-300' };
            if (n > 0) return { iconHtml: '<i class="fa-solid fa-temperature-quarter"></i>', lightTextClass: 'text-red-500', darkTextClass: 'text-red-300' };
            if (n <= -75) return { iconHtml: '<i class="fa-solid fa-mountain"></i>', lightTextClass: 'text-blue-500', darkTextClass: 'text-blue-300' };
            if (n <= -50) return { iconHtml: '<i class="fa-solid fa-temperature-empty"></i>', lightTextClass: 'text-blue-500', darkTextClass: 'text-blue-300' };
            if (n <= -30) return { iconHtml: '<i class="fa-solid fa-wind"></i>', lightTextClass: 'text-blue-500', darkTextClass: 'text-blue-300' };
            if (n <= -15) return { iconHtml: '<i class="fa-regular fa-snowflake"></i>', lightTextClass: 'text-blue-500', darkTextClass: 'text-blue-300' };
            if (n <= -5) return { iconHtml: '<i class="fa-solid fa-glass-water"></i>', lightTextClass: 'text-blue-500', darkTextClass: 'text-blue-300' };
            if (n < 0) return { iconHtml: '<i class="fa-solid fa-droplet"></i>', lightTextClass: 'text-blue-500', darkTextClass: 'text-blue-300' };
            return { iconHtml: '<i class="fa-solid fa-minus"></i>', lightTextClass: 'text-slate-500', darkTextClass: 'text-slate-300' };
        }

        function safeSetText(id, text) { const el = getEl(id); if (el) el.innerText = text; }
        function safeSetHTML(id, html) { const el = getEl(id); if (el) el.innerHTML = html; }
        function shouldAnimateUi() {
            const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            return !lowPowerMode && !document.hidden && !reduceMotion;
        }
        function applyLowPowerMode(enabled) {
            lowPowerMode = !!enabled;
            document.body.classList.toggle('low-power-mode', lowPowerMode);
            document.body.classList.toggle('motion-enabled', shouldAnimateUi());
            if (assetChart) {
                assetChart.options.animation = lowPowerMode ? false : { animateRotate: true, duration: 450 };
                assetChart.update('none');
            }
            localStorage.setItem('isa_low_power_mode', lowPowerMode ? '1' : '0');
            safeSetText('low-power-toggle', `저전력 모드: ${lowPowerMode ? 'ON' : 'OFF'}`);
        }
        window.toggleLowPowerMode = () => applyLowPowerMode(!lowPowerMode);
        function setSyncStatus(text) {
            safeSetText('sync-time', text);
            safeSetText('sync-time-mini', text);
        }
        function getSyncErrorMeta(error, fallbackCode = 'UNKNOWN') {
            const message = String(error?.message || error || '알 수 없는 오류');
            const rawCode = String(error?.code || '').trim();
            const lower = `${rawCode} ${message}`.toLowerCase();

            if (lower.includes('permission-denied')) return { code: 'PERMISSION_DENIED', reason: '권한 부족(파이어스토어 규칙 확인)' };
            if (lower.includes('unavailable')) return { code: 'SERVICE_UNAVAILABLE', reason: '서비스 일시 불가' };
            if (lower.includes('deadline-exceeded') || lower.includes('time out') || lower.includes('시간 초과') || lower.includes('timeout')) return { code: 'TIMEOUT', reason: '요청 시간 초과' };
            if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('aborterror')) return { code: 'NETWORK', reason: '네트워크 연결 문제' };
            if (lower.includes('http 401') || lower.includes('http 403')) return { code: 'AUTH', reason: '인증/권한 오류(HTTP 401/403)' };
            if (lower.includes('http 404')) return { code: 'NOT_FOUND', reason: '요청 대상 없음(HTTP 404)' };
            if (lower.includes('http 5')) return { code: 'SERVER_HTTP', reason: '서버 응답 오류(HTTP 5xx)' };
            if (lower.includes('파이어베이스 설정이 필요')) return { code: 'FIREBASE_CONFIG', reason: '파이어베이스 설정 누락' };
            if (lower.includes("can't find variable") || lower.includes('is not defined')) return { code: 'REFERENCE', reason: '정의되지 않은 변수 참조' };
            return { code: rawCode || fallbackCode, reason: message };
        }
        function setSyncFailureStatus(stage, error, fallbackCode = 'UNKNOWN') {
            const meta = getSyncErrorMeta(error, fallbackCode);
            const text = `동기화 실패 - ${stage}/${meta.code}: ${meta.reason}`;
            setSyncStatus(text);
            console.error(`[SYNC][${stage}][${meta.code}]`, error);
        }
        function applyAppVersion() {
            document.title = `ISA RICH Premium ver${APP_VERSION}`;
            safeSetText('settings-version', `v${APP_VERSION}`);
        }

        function getStockVisual(name, ticker, fallbackColor = '#64748b') {
            const safeName = String(name || '').trim();
            const safeTicker = String(ticker || '').trim();
            const upperTicker = safeTicker.toUpperCase();

            if (safeName.includes('초고배당')) return { label: '초', bgColor: '#10b981' };
            if (safeName.includes('고배당')) return { label: '고', bgColor: '#f59e0b' };
            if (safeName.includes('S&P') || upperTicker === 'S&P500' || upperTicker === 'SP500') return { label: 'S', bgColor: '#3b82f6' };

            return { label: String(safeName || safeTicker || '?')[0] || '?', bgColor: fallbackColor };
        }

        function renderHoldingCard({ ticker, name, yieldPct, shares, avgPrice, value, profit, prate, itemTrend, avatarColor }) {
            const trendToneClass = prate >= 8 ? 'holding-tone-up' : (prate <= -8 ? 'holding-tone-down' : 'holding-tone-flat');
            const edgeClass = prate >= 8 ? 'bg-gradient-to-b from-rose-400 to-orange-300' : (prate <= -8 ? 'bg-gradient-to-b from-blue-400 to-cyan-300' : 'bg-gradient-to-b from-slate-300 to-slate-200');
            const safeName = escapeHtml(name);
            const safeTicker = escapeHtml(ticker);
            const stockVisual = getStockVisual(name, ticker, avatarColor);
            const avatarInitial = escapeHtml(stockVisual.label);
            const signedRate = `${profit >= 0 ? '+' : '-'}${Math.abs(prate).toFixed(1)}%`;

            return `<div class="holding-item ${trendToneClass} relative flex justify-between items-start md:items-center py-3 px-4 rounded-[1.25rem] cursor-pointer group text-left gap-3 border-b-2 border-b-slate-200/80 overflow-hidden" data-ticker="${safeTicker}"><span class="holding-edge absolute left-0 top-0 h-full w-1.5 ${edgeClass}"></span><div class="flex items-center gap-3 text-left min-w-0 flex-1 pl-1"><div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-[11px] shadow-sm" style="background:${stockVisual.bgColor}">${avatarInitial}</div><div class="text-left font-sans min-w-0"><p class="font-black text-slate-800 text-[13px] font-sans truncate">${safeName} <span class="text-blue-500 font-bold text-[9px] ml-0.5 font-sans">[${yieldPct.toFixed(2)}%]</span></p><p class="text-[10px] text-slate-400 font-black mt-0.5 font-sans">${shares.toFixed(2)}주 · ₩${Math.round(avgPrice).toLocaleString()}</p></div></div><div class="text-right font-sans shrink-0 pl-1.5"><p class="font-black ${itemTrend.lightTextClass} text-[13px] text-right font-sans">₩${Math.round(value).toLocaleString()}</p><div class="mt-1 flex items-center justify-end gap-1.5"><span class="text-[11px] font-black ${itemTrend.lightTextClass}">${signedRate}</span><span class="text-[9px] font-black ${itemTrend.lightTextClass}">${itemTrend.iconHtml}</span></div></div></div>`;
        }

        function switchTab(type) {
            const pb = getEl('tab-btn-purchase'), db = getEl('tab-btn-deposit');
            if(pb && db) {
                pb.classList.remove('active-purchase', 'active-deposit');
                db.classList.remove('active-purchase', 'active-deposit');
                if(type === 'purchase') {
                    pb.classList.add('active-purchase'); getEl('tab-content-purchase').classList.remove('hidden'); getEl('tab-content-deposit').classList.add('hidden');
                } else {
                    db.classList.add('active-deposit'); getEl('tab-content-purchase').classList.add('hidden'); getEl('tab-content-deposit').classList.remove('hidden');
                }
            }
            if(type === 'purchase') updateQuickSelectUI();
        }

        function setDepositCat(n) {
            getEl('wallet-category').value = n;
            const dividendField = getEl('dividend-stock-field');
            if (dividendField) dividendField.classList.toggle('hidden', String(n) !== '3');
            [1,2,3].forEach(i => {
                const btn = getEl('dep-cat-'+i);
                if(btn) {
                    if(i == n) btn.className = "flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-blue-600 bg-blue-600 text-white text-[11px] font-black transition shadow-lg shadow-blue-500/20 text-center";
                    else btn.className = "flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-500 text-[11px] font-black transition text-center hover:border-slate-300";
                }
            });
        }

        function updateDividendTickerOptions() {
            const select = getEl('div-ticker');
            if (!select) return;
            const prev = String(select.value || 'DEPOSIT');
            const tickers = Object.keys(marketData || {});
            select.innerHTML = `<option value="DEPOSIT">종목 미지정</option>${tickers.map(ticker => `<option value="${escapeHtml(ticker)}">${escapeHtml(String(marketData[ticker]?.name || ticker))}</option>`).join('')}`;
            select.value = (prev === 'DEPOSIT' || tickers.includes(prev)) ? prev : 'DEPOSIT';
        }

        async function syncAllData() {
            if (isSyncing) { setSyncStatus("동기화 진행 중..."); return; }
            isSyncing = true;
            setSyncStatus("동기화 중...");
            const icon = getEl('sync-icon'); if(icon) icon.classList.add('sync-spin');
            try {
                if(!firestoreDb && !initFirebase()) {
                    setSyncStatus("동기화 실패 - FIREBASE_INIT: 파이어베이스 미연결");
                    return;
                }
                await ensureFirebaseAuth();
                const hasPriceUrl = Boolean(PRICE_CACHE_URL) || isValidSheetsUrl(sheetsUrl);
                let priceSyncFailed = false;
                let priceSyncMeta = null;
                let historyRecoveredWithFallback = false;

                if(hasPriceUrl) {
                    try {
                        marketData = await loadPriceData();
                    } catch (e) {
                        priceSyncMeta = getSyncErrorMeta(e, 'PRICE_FETCH');
                        console.error(`[SYNC][PRICE_FETCH][${priceSyncMeta.code}]`, e);
                        priceSyncFailed = true;
                    }
                }

                try {
                    transactions = mergePendingTransactions(await loadTransactionsFromFirebase());
                    transactionsVersion += 1;
                    invalidateMonthlyReportCaches({ persisted: true });
                } catch(e) {
                    console.error(e);
                    const fallbackCollection = 'isa_history';
                    if(firebaseCollection !== fallbackCollection) {
                        try {
                            firebaseCollection = fallbackCollection;
                            transactions = mergePendingTransactions(await loadTransactionsFromFirebase());
                            transactionsVersion += 1;
                            invalidateMonthlyReportCaches({ persisted: true });
                            historyRecoveredWithFallback = true;
                        } catch (retryError) {
                            setSyncFailureStatus('HISTORY_LOAD', retryError, 'HISTORY_RETRY');
                            return;
                        }
                    } else {
                        setSyncFailureStatus('HISTORY_LOAD', e, 'HISTORY_LOAD');
                        return;
                    }
                }

                primeMonthlyReportFromTransactions();
                saveLocalDataSnapshot();
                updateUI(); updateQuickSelectUI(); updateDividendTickerOptions();
                const totalValueEl = getEl('stat-total-value');
                if (totalValueEl && !lowPowerMode) {
                    totalValueEl.classList.remove('sync-flash');
                    void totalValueEl.offsetWidth;
                    totalValueEl.classList.add('sync-flash');
                    setTimeout(() => totalValueEl.classList.remove('sync-flash'), 650);
                }

                const loadedHint = transactions.length > 0 ? ` · ${transactions.length}건` : '';
                if(historyRecoveredWithFallback) setSyncStatus("컬렉션 자동 복구 · 기록 동기화됨" + loadedHint);
                else if(!hasPriceUrl) setSyncStatus("가격 URL 미설정 · 기록만 동기화됨" + loadedHint);
                else if(priceSyncFailed) setSyncStatus(`가격 연결 실패(${priceSyncMeta?.code || 'PRICE_FETCH'}) · 기록은 동기화됨${loadedHint}`);
                else setSyncStatus("최근 업데이트: " + new Date().toLocaleTimeString() + loadedHint);
            } catch (e) {
                setSyncFailureStatus('SYNC_ALL', e, 'SYNC_ALL');
            } finally {
                if(icon) icon.classList.remove('sync-spin');
                isSyncing = false;
            }
        }

async function postMutation(action, payload = {}) {
  if(!firestoreDb) {
    throw new Error('파이어베이스 설정 후 다시 시도해 주세요.');
  }
  await ensureFirebaseAuth();

  if(action === 'add') return await addTransactionToFirebase(payload);
  if(action === 'delete') return await deleteTransactionFromFirebase(payload.id);

  throw new Error('처리할 수 없는 파이어베이스 작업입니다.');
}


        async function saveStockPurchase() {
            const date = getEl('input-date').value;
            const shares = roundShares(getEl('input-shares').value);
            const price = Number(getEl('input-price').value);
            const ticker = getEl('input-ticker').value;
            const name = getEl('input-name').value;
            const editId = getEl('edit-id').value;
            const originalTx = editId ? transactions.find(x => String(x.id) === String(editId)) : null;
            if (!date || !ticker || shares <= 0 || price <= 0) {
                alert('날짜, 금액(0보다 큼), 수량(0보다 큼)을 입력해 주세요.');
                return;
            }
            const btn = getEl('save-btn'); if(btn) { btn.innerText = "처리 중..."; btn.disabled = true; }
            try {
                const payload = {
                    id: editId || createTxnId(),
                    date,
                    ticker,
                    name,
                    shares,
                    price,
                    category: 0,
                    side: 'buy',
                    keepCreatedAtMs: Number(originalTx?.createdAtMs || 0)
                };
                const savedId = await postMutation('add', payload);
                await syncAfterAdd(payload, savedId);
                resetPurchaseForm(); showSection('dashboard');
            } catch(e) {
                console.error(e);
                alert('저장 실패: ' + (e?.message || '네트워크 오류'));
            }
            if(btn) { btn.innerText = "매수하기"; btn.disabled = false; }
        }

        window.exitEditMode = () => { resetPurchaseForm(); showSection('history'); };

        function resetPurchaseForm() {
            if(getEl('input-shares')) getEl('input-shares').value = ""; 
            if(getEl('input-price')) getEl('input-price').value = "";
            if(getEl('edit-id')) getEl('edit-id').value = ""; 
            if(getEl('save-btn')) getEl('save-btn').innerText = "매수하기";
            if(getEl('save-div-btn')) getEl('save-div-btn').innerText = "충전하기";
            if(getEl('cancel-edit-btn')) getEl('cancel-edit-btn').classList.add('hidden');
            if(getEl('cancel-edit-btn-deposit')) getEl('cancel-edit-btn-deposit').classList.add('hidden');
            if(getEl('div-ticker')) getEl('div-ticker').value = "DEPOSIT";
            selectedTicker = ""; updateQuickSelectUI();
        }

        async function saveWalletDeposit() {
            const date = getEl('div-date').value, amount = Number(getEl('div-amount').value), cat = normalizeCashCategory(getEl('wallet-category').value), editId = getEl('edit-id').value;
            const originalTx = editId ? transactions.find(x => String(x.id) === String(editId)) : null;
            if(!date || !amount) return;
            const selectedDividendTicker = String(getEl('div-ticker')?.value || 'DEPOSIT').trim();
            const dividendTicker = selectedDividendTicker || 'DEPOSIT';
            const dividendName = String(marketData?.[dividendTicker]?.name || dividendTicker).trim();
            const depositTicker = cat === '3' ? dividendTicker : 'DEPOSIT';
            const depositName = cat === '3'
                ? (depositTicker === 'DEPOSIT' ? '배당 입금' : `${dividendName} 배당 입금`)
                : '현금 입금';
            const btn = getEl('save-div-btn'); if(btn) { btn.innerText = "처리 중..."; btn.disabled = true; }
            try {
                const payload = {
                    id: editId || createTxnId(),
                    date,
                    ticker: depositTicker,
                    name: depositName,
                    shares: 1,
                    price: amount,
                    category: cat,
                    keepCreatedAtMs: Number(originalTx?.createdAtMs || 0)
                };
                const savedId = await postMutation('add', payload);
                await syncAfterAdd(payload, savedId);
                resetPurchaseForm(); showSection('dashboard');
            } catch(e) {
                console.error(e);
                alert('충전 실패: ' + (e?.message || '네트워크 오류'));
            }
            if(btn) { btn.innerText = "충전하기"; btn.disabled = false; }
        }

        window.switchDetailTab = (tab) => {
            const historyPanel = getEl('detail-tab-history');
            const tradePanel = getEl('detail-tab-trade');
            const historyBtn = getEl('detail-tab-history-btn');
            const tradeBtn = getEl('detail-tab-trade-btn');
            const isTrade = tab === 'trade';

            historyPanel?.classList.toggle('hidden', isTrade);
            tradePanel?.classList.toggle('hidden', !isTrade);

            historyBtn?.classList.toggle('bg-slate-900', !isTrade);
            historyBtn?.classList.toggle('text-white', !isTrade);
            historyBtn?.classList.toggle('text-slate-500', isTrade);

            tradeBtn?.classList.toggle('bg-slate-900', isTrade);
            tradeBtn?.classList.toggle('text-white', isTrade);
            tradeBtn?.classList.toggle('text-slate-500', !isTrade);
        };

        window.saveDetailTrade = async (side) => {
            const date = getEl('detail-trade-date')?.value;
            const price = Number(getEl('detail-trade-price')?.value || 0);
            const sharesInput = roundShares(getEl('detail-trade-shares')?.value || 0);
            const isSell = side === 'sell';
            const shares = isSell ? -Math.abs(sharesInput) : Math.abs(sharesInput);
            const actionBtn = getEl(isSell ? 'detail-sell-btn' : 'detail-buy-btn');
            const defaultLabel = isSell ? '매도' : '매수';

            if(!detailModalTicker || !detailModalName) {
                alert('종목 정보를 찾지 못했습니다. 상세 창을 다시 열어 주세요.');
                return;
            }
            if(!date || !sharesInput || price <= 0) {
                alert('날짜, 금액(0보다 큼), 수량을 모두 입력해 주세요.');
                return;
            }
            if(isSell) {
                const holdingShares = getHoldingSharesByTicker(detailModalTicker);
                const sellShares = Math.abs(sharesInput);
                if(sellShares > holdingShares) {
                    alert(`보유 수량(${holdingShares.toFixed(2)}주)을 초과해 매도할 수 없습니다.`);
                    return;
                }
            }

            if(actionBtn) {
                actionBtn.disabled = true;
                actionBtn.innerText = "처리 중...";
            }
            try {
                const payload = {
                    id: createTxnId(),
                    date,
                    ticker: detailModalTicker,
                    name: detailModalName,
                    shares,
                    price,
                    category: 0,
                    side: isSell ? 'sell' : 'buy'
                };
                const savedId = await postMutation('add', payload);
                await syncAfterAdd(payload, savedId);
                if(getEl('detail-trade-shares')) getEl('detail-trade-shares').value = '';
                openDetailModal(detailModalTicker);
                switchDetailTab('history');
            } catch (e) {
                console.error(e);
                alert('저장 실패: ' + (e?.message || '네트워크 오류'));
            }
            if(actionBtn) {
                actionBtn.disabled = false;
                actionBtn.innerText = defaultLabel;
            }
        };

        function updateUI() {
            let totalV = 0, totalD = 0;
            const state = getPortfolioState();
            const h = state.holdings;
            const cashD = state.cash;
            const chargedByCat = state.chargedByCat;
            const usedByCat = state.buyUsedByCat;
            const cumulativeBuyAmount = state.totalBuyAmount;
            const openCostBasis = getOpenPositionCostBasis(h);
            totalBuyAmount = cumulativeBuyAmount;

            const usedDiv = usedByCat['3'];
            const curCash = cashD["1"] + cashD["2"] + cashD["3"];

            let reinvestRate = totalBuyAmount > 0 ? (usedDiv / totalBuyAmount * 100) : 0;
            if(Math.round(cashD["3"]) > 0) getEl('cash-card-area')?.classList.add('reinvest-highlight');
            else getEl('cash-card-area')?.classList.remove('reinvest-highlight');

            let listHTML = "", labels = [], data = [], bg = [];
            Object.keys(h).forEach((k, i) => {
                const d = h[k]; if (d.shares <= 0) return;
                const m = marketData[k] || {};
                const avgPrice = d.shares > 0 ? d.cost / d.shares : 0;
                const rawMarketPrice = Number(m.price || 0);
                const marketPrice = Number.isFinite(rawMarketPrice) && rawMarketPrice > 0 ? rawMarketPrice : avgPrice;
                let yieldPct = Number(m.yield || 0); if(yieldPct < 1 && yieldPct > 0) yieldPct *= 100;
                const val = d.shares * marketPrice, profit = val - d.cost, prate = d.cost > 0 ? (profit/d.cost)*100 : 0, div = val * (yieldPct/100/12);
                const itemTrend = getTrendVisual(prate);
                totalV += val; totalD += div;
                labels.push(d.name); data.push(val); bg.push(COLORS[i % COLORS.length]);
                listHTML += renderHoldingCard({
                    ticker: k,
                    name: d.name,
                    yieldPct,
                    shares: d.shares,
                    avgPrice,
                    value: val,
                    profit,
                    prate,
                    itemTrend,
                    avatarColor: bg[i]
                });
            });
            animateValue('stat-total-value', 0, Math.round(totalV), 900);
            const totProfit = totalV - openCostBasis, totRate = openCostBasis > 0 ? (totProfit/openCostBasis)*100 : 0;
            const totalTrend = getTrendVisual(totRate);
            safeSetText('stat-profit-amount', `₩${Math.round(Math.abs(totProfit)).toLocaleString()}`);
            const amountBox = getEl('stat-profit-amount');
            if (amountBox) {
                amountBox.classList.remove('text-white/80', 'text-red-300', 'text-blue-300', 'text-slate-300');
                amountBox.classList.add(totalTrend.darkTextClass);
            }
            const pctBox = getEl('stat-profit-pct');
            if (pctBox) {
                pctBox.classList.remove('text-white/60', 'text-red-300', 'text-blue-300', 'text-slate-300');
                pctBox.classList.add(totalTrend.darkTextClass);
            }
            safeSetHTML('stat-profit-pct', `${totProfit>=0?'+':''}${totRate.toFixed(1)}%`);
            safeSetHTML('stat-profit-icon', totalTrend.iconHtml);
            safeSetText('stat-cash-balance', `₩${Math.round(curCash).toLocaleString()}`);
            if (!currentMonthlyModeKey) currentMonthlyModeKey = getCurrentMonthKey();
            const monthReport = monthlyReportCache.get(currentMonthlyModeKey) || getCurrentMonthReport(transactions, currentMonthlyModeKey);
            monthlyBreakdownOpen = loadMonthlyBreakdownState(monthReport.monthKey || currentMonthlyModeKey || getCurrentMonthKey());
            safeSetText('report-month-label', monthReport.monthKey || '-');
            safeSetText('report-realized-pnl', `₩${Math.round(monthReport.realizedPnl).toLocaleString()}`);
            safeSetText('report-dividend-in', `₩${Math.round(monthReport.totalReturnAmount || 0).toLocaleString()} (${Number(monthReport.monthlyTotalReturnRate || 0).toFixed(2)}%)`);
            updateMonthlyReviewPanel(monthReport);

            const reportPnlEl = getEl('report-realized-pnl');
            if (reportPnlEl) {
                reportPnlEl.classList.remove('text-rose-600', 'text-blue-600', 'text-slate-900');
                reportPnlEl.classList.add(
                    monthReport.realizedPnl > 0 ? 'text-rose-600' :
                    monthReport.realizedPnl < 0 ? 'text-blue-600' : 'text-slate-900'
                );
            }
            const usableCash = Math.max(0, Math.floor(curCash));
            const tickerA = BUY_PLAN_TICKERS[0], tickerB = BUY_PLAN_TICKERS[1];
            const priceA = Number(marketData[tickerA]?.price || 0);
            const priceB = Number(marketData[tickerB]?.price || 0);
            const nameA = marketData[tickerA]?.name || `티커 ${tickerA}`;
            const nameB = marketData[tickerB]?.name || `티커 ${tickerB}`;

            let qtyA = 0, qtyB = 0;
            let remainCash = usableCash;

            const currentValueA = (h[tickerA]?.shares || 0) * priceA;
            const currentValueB = (h[tickerB]?.shares || 0) * priceB;

            if(priceA > 0 && priceB > 0) {
                const minPrice = Math.min(priceA, priceB);
                while(remainCash >= minPrice) {
                    const totalNow = currentValueA + currentValueB + (qtyA * priceA) + (qtyB * priceB);
                    const aNow = currentValueA + (qtyA * priceA);
                    const bNow = currentValueB + (qtyB * priceB);
                    const ratioA = totalNow > 0 ? (aNow / totalNow) : BUY_PLAN_WEIGHTS[0];
                    const ratioB = totalNow > 0 ? (bNow / totalNow) : BUY_PLAN_WEIGHTS[1];

                    const needA = ratioA < BUY_PLAN_WEIGHTS[0];
                    const needB = ratioB < BUY_PLAN_WEIGHTS[1];

                    if(needA && remainCash >= priceA) {
                        qtyA += 1;
                        remainCash -= priceA;
                        continue;
                    }
                    if(needB && remainCash >= priceB) {
                        qtyB += 1;
                        remainCash -= priceB;
                        continue;
                    }

                    // 비율이 이미 맞춰졌거나 둘 다 넘친 상태면 6:4 상위 비중(A) 우선
                    if(remainCash >= priceA) {
                        qtyA += 1;
                        remainCash -= priceA;
                    } else if(remainCash >= priceB) {
                        qtyB += 1;
                        remainCash -= priceB;
                    } else {
                        break;
                    }
                }
            }

            const spendA = qtyA * priceA;
            const spendB = qtyB * priceB;
            safeSetText('buy-plan-a-title', nameA);
            safeSetText('buy-plan-b-title', nameB);
            safeSetText('buy-plan-a', `${qtyA.toLocaleString()}주 매수 (₩${Math.round(spendA).toLocaleString()})`);
            safeSetText('buy-plan-b', `${qtyB.toLocaleString()}주 매수 (₩${Math.round(spendB).toLocaleString()})`);

            const planAEl = getEl('plan-a-card');
            const planBEl = getEl('plan-b-card');
            const plansWrap = getEl('cash-buy-plans');
            const emptyBox = getEl('cash-buy-empty');
            const canBuyA = qtyA > 0;
            const canBuyB = qtyB > 0;
            if(planAEl) planAEl.classList.toggle('hidden', !canBuyA);
            if(planBEl) planBEl.classList.toggle('hidden', !canBuyB);
            if(planAEl) {
                planAEl.classList.remove('ring-2', 'ring-cyan-200/60', 'bg-white/10', 'bg-cyan-400/20');
                if (canBuyA) planAEl.classList.add('ring-2', 'ring-cyan-200/60', 'bg-cyan-400/20');
                else planAEl.classList.add('bg-white/10');
            }
            if(planBEl) {
                planBEl.classList.remove('ring-2', 'ring-violet-200/60', 'bg-white/10', 'bg-violet-400/20');
                if (canBuyB) planBEl.classList.add('ring-2', 'ring-violet-200/60', 'bg-violet-400/20');
                else planBEl.classList.add('bg-white/10');
            }
            const noPlan = !canBuyA && !canBuyB;
            if(plansWrap) plansWrap.classList.toggle('hidden', noPlan);
            if(emptyBox) emptyBox.classList.toggle('hidden', !noPlan);
            safeSetText('stat-reinvest-rate', `${reinvestRate.toFixed(1)}%`);
            safeSetText('stat-monthly-dividend', `₩${Math.round(totalD).toLocaleString()}`);
            const level = getDividendLevel(totalD);
            const nextMilestone = getNextDividendMilestone(totalD);
            safeSetText('div-level-icon', level.icon);
            safeSetText('dividend-level-text', level.text);
            if (nextMilestone.isMax) {
                safeSetText('dividend-next-goal', '🚀 최고 레벨을 유지 중이에요!');
            } else {
                safeSetText('dividend-next-goal', `다음: ${nextMilestone.icon} ${nextMilestone.text} · ₩${Math.round(nextMilestone.remaining).toLocaleString()} 남음`);
            }
            const bDiv = Math.round(chargedByCat["3"]), bSpec = Math.round(chargedByCat["2"]), bBase = Math.round(chargedByCat["1"]);
            safeSetText('modal-cash-div', `₩${bDiv.toLocaleString()}`); safeSetText('modal-cash-spec', `₩${bSpec.toLocaleString()}`); safeSetText('modal-cash-base', `₩${bBase.toLocaleString()}`);
            safeSetHTML('holdings-list', listHTML || `<div class="text-center p-6 text-slate-300 font-black text-[10px] uppercase font-sans">데이터 없음</div>`);
            if (getEl('assetChart')) {
                
                
if(assetChart){
    assetChart.data.labels = labels;
    assetChart.data.datasets[0].data = data;
    assetChart.options.animation = lowPowerMode ? false : { animateRotate: true, duration: 450 };
    assetChart.update(lowPowerMode ? 'none' : undefined);
} else {
    assetChart = new Chart(getEl('assetChart').getContext('2d'), {
        plugins:[centerTextPlugin],
 type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: bg, borderWidth: 3, borderColor: '#ffffff' }] }, options: { cutout: '82%', plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false,
                animation: {
                    animateRotate: true,
                    duration: 450
                }
            } }); }
            }
            safeSetHTML('chart-legend', labels.map((l, i) => {
                const pct = totalV > 0 ? (data[i] / totalV) * 100 : 0;
                return `<div class="flex justify-between text-[10px] mb-2 font-black transition hover:translate-x-1 text-left font-sans"><span class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full" style="background:${bg[i]}"></span><span class="truncate w-24 text-slate-500 font-sans">${escapeHtml(l)}</span></span><span class="text-slate-800 text-right font-sans">${pct.toFixed(1)}%</span></div>`;
            }).join(''));
            renderHistoryList('history-list', transactions);


        }

        function getTradeDateTime(tx) {
            const dateMs = new Date(String(tx?.date || '')).getTime();
            return Number.isNaN(dateMs) ? 0 : dateMs;
        }

        function getTransactionSortTime(tx) {
            const createdAtMs = Number(tx?.createdAtMs || 0);
            if (!Number.isNaN(createdAtMs) && createdAtMs > 0) return createdAtMs;

            const idNum = Number(tx?.id);
            if (!Number.isNaN(idNum) && idNum > 0) return idNum;

            return getTradeDateTime(tx);
        }

        function updateHistoryFilterUI() {
            document.querySelectorAll('.history-filter-btn').forEach((btn) => {
                const isActive = btn.dataset.historyFilter === String(historyFilterDays);
                btn.classList.toggle('bg-slate-900', isActive);
                btn.classList.toggle('border-slate-900', isActive);
                btn.classList.toggle('text-white', isActive);
                btn.classList.toggle('bg-white', !isActive);
                btn.classList.toggle('border-slate-200', !isActive);
                btn.classList.toggle('text-slate-500', !isActive);
            });
        }

        function filterHistoryByRange(data) {
            if (historyFilterDays === 'all') return data;
            const days = Number(historyFilterDays);
            if (Number.isNaN(days) || days <= 0) return data;
            const threshold = Date.now() - (days * 24 * 60 * 60 * 1000);
            return data.filter((tx) => getTradeDateTime(tx) >= threshold);
        }

        function renderHistoryList(containerId, data) {
            const container = getEl(containerId); if (!container) return;
            const sortedData = filterHistoryByRange([...data]).sort((a, b) => {
                const diff = getTransactionSortTime(b) - getTransactionSortTime(a);
                if (diff !== 0) return diff;
                return String(b.id || '').localeCompare(String(a.id || ''));
            });
            const visibleData = sortedData.slice(0, historyVisibleCount);
            const grouped = visibleData.reduce((acc, tx) => {
                const dateObj = new Date(String(tx?.date || ''));
                const key = Number.isNaN(dateObj.getTime())
                    ? '날짜 미상'
                    : `${dateObj.getFullYear()}년 ${String(dateObj.getMonth() + 1).padStart(2, '0')}월`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(tx);
                return acc;
            }, {});

            const html = Object.entries(grouped).map(([monthKey, monthItems]) => {
                const itemsHtml = monthItems.map(t => {
                const isDeposit = isDepositTransaction(t);
                const sideRaw = String(t?.side || t?.type || '').trim().toLowerCase();
                const sharesRaw = Number(t?.shares || 0);
                const isSell = !isDeposit && (sideRaw === 'sell' || sideRaw === '매도' || sharesRaw < 0);
                const tradeLabel = isDeposit ? '현금 입금' : (isSell ? '매도' : '매수');
                const normalizedCategory = normalizeCashCategory(t.category);
                const depositLabel = CAT_NAMES[normalizedCategory] || '기본';
                const depositToneMap = {
                    "1": { textClass: 'text-emerald-600', borderClass: 'border-l-emerald-500', iconClass: 'emerald-600' },
                    "2": { textClass: 'text-violet-600', borderClass: 'border-l-violet-500', iconClass: 'violet-600' },
                    "3": { textClass: 'text-blue-600', borderClass: 'border-l-blue-500', iconClass: 'blue-600' }
                };
                const depositTone = depositToneMap[normalizedCategory] || depositToneMap["3"];
                const tradeTone = isSell
                    ? { textClass: 'text-slate-900', borderClass: 'border-l-blue-500', iconClass: 'blue-500', bgClass: 'bg-blue-50/60' }
                    : { textClass: 'text-slate-900', borderClass: 'border-l-rose-500', iconClass: 'rose-500', bgClass: 'bg-rose-50/60' };
                const displayName = isDeposit ? String(t.name || '') : getTradeDisplayName(t);
                const stockVisual = getStockVisual(displayName, t.ticker, isSell ? '#3b82f6' : '#ef4444');
                const stockIcon = `<span class="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[11px] font-black" style="background:${stockVisual.bgColor}">${escapeHtml(stockVisual.label)}</span>`;
                const iconCode = isDeposit ? CAT_ICONS[normalizedCategory] || '💳' : stockIcon;
                const themeColor = isDeposit ? depositTone.iconClass : tradeTone.iconClass;
                const safeName = escapeHtml(displayName);
                const safeId = escapeHtml(t.id);
                const safeDate = escapeHtml(String(t.date || '').substring(0, 10));
                const shares = Number(t.shares || 0);
                const price = Number(t.price || 0);
                const amountTextClass = isDeposit ? depositTone.textClass : tradeTone.textClass;
                const leftBorderClass = isDeposit ? depositTone.borderClass : tradeTone.borderClass;
                const shareMeta = `${Math.abs(shares).toFixed(2)}주 · @₩${price.toLocaleString()}`;
                const tradeBgClass = isDeposit ? '' : tradeTone.bgClass;
                const tradeLabelClass = isDeposit ? 'text-slate-400' : (isSell ? 'text-blue-500' : 'text-rose-500');
                return `<div class="glass-card ${tradeBgClass} p-3.5 md:p-4 flex justify-between items-start md:items-center transition hover:shadow-xl border-l-4 gap-2.5 ${leftBorderClass} text-left font-sans"><div class="flex items-center gap-3.5 text-left font-sans min-w-0 flex-1"><div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[12px] border border-slate-100 shadow-sm text-center"><span class="text-${themeColor} flex items-center justify-center">${iconCode}</span></div><div class="text-left font-sans min-w-0"><p class="text-[9px] font-black mb-0.5 uppercase tracking-widest text-left font-sans"><span class="text-slate-400">${safeDate} · </span><span class="${tradeLabelClass}">${tradeLabel}</span></p><p class="text-[13px] font-black ${isDeposit ? depositTone.textClass : tradeTone.textClass} text-left font-sans truncate">${isDeposit ? (depositLabel + ' 입금') : safeName}</p><p class="text-[9px] text-slate-400 font-black uppercase mt-0.5 text-left font-sans">${isDeposit ? safeName : shareMeta}</p></div></div><div class="flex flex-col items-end gap-2 text-right font-sans shrink-0 pl-2"><p class="font-black ${amountTextClass} text-sm tracking-tight text-right font-sans">₩${Math.round(Math.abs(shares*price)).toLocaleString()}</p><div class="flex gap-2 font-sans"><button type="button" data-action="edit" data-id="${safeId}" class="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition hover:bg-indigo-500 hover:text-white active:scale-90"><svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button><button type="button" data-action="delete" data-id="${safeId}" class="w-6 h-6 flex items-center justify-center rounded-lg bg-rose-50 text-rose-400 transition hover:bg-rose-500 hover:text-white active:scale-90"><svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button></div></div></div>`;
                }).join('');
                return `<section class="space-y-2"><h4 class="px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">${escapeHtml(monthKey)}</h4><div class="space-y-2">${itemsHtml}</div></section>`;
            }).join('');

            container.innerHTML = html || `<div class="text-center p-24 text-slate-300 font-black text-[10px] uppercase font-sans">기록 없음</div>`;

            const loadMoreBtn = getEl('history-load-more');
            if (loadMoreBtn) {
                const hasMore = sortedData.length > visibleData.length;
                loadMoreBtn.classList.toggle('hidden', !hasMore);
            }
            updateHistoryFilterUI();
        }

        function updateQuickSelectUI() {
            const box = getEl('quick-select-buttons'); if(!box) return;
            const tickers = Object.keys(marketData);
            if(tickers.length > 0) {
                box.innerHTML = tickers.map(k => `<button type="button" data-ticker="${escapeHtml(k)}" class="quick-select-btn px-3.5 py-2.5 ${selectedTicker === k ? 'bg-slate-900 text-white border-slate-900 shadow-lg font-sans' : 'bg-white text-slate-500 border-slate-100 shadow-sm font-sans'} border rounded-xl text-[10px] font-black hover:border-indigo-500 transition active:scale-95 shadow-sm text-center font-sans uppercase">${escapeHtml(marketData[k].name)}</button>`).join('');
            } else box.innerHTML = `<div class="text-[10px] text-slate-300 p-4 border border-dashed border-slate-200 rounded-xl w-full text-center font-black uppercase font-sans">데이터 수신 대기...</div>`; 
        }

        window.fillForm = (k) => {
            const d = marketData[k]; if(!d) return;
            selectedTicker = k; getEl('input-ticker').value = k; getEl('input-name').value = d.name; getEl('input-price').value = d.price; getEl('input-shares').focus(); updateQuickSelectUI();
        };

        window.editTransaction = (id) => {
            const t = transactions.find(x => x.id == id); if(!t) return;
            const isDeposit = isDepositTransaction(t);
            if(isDeposit) {
                showSection('transaction'); switchTab('deposit');
                getEl('div-date').value = String(t.date).substring(0,10); getEl('div-amount').value = t.price;
                setDepositCat(normalizeCashCategory(t.category));
                if (normalizeCashCategory(t.category) === '3' && getEl('div-ticker')) {
                    const depositTicker = String(t.ticker || 'DEPOSIT').trim() || 'DEPOSIT';
                    getEl('div-ticker').value = depositTicker;
                }
                getEl('edit-id').value = id; getEl('save-div-btn').innerText = "수정 저장"; getEl('cancel-edit-btn-deposit').classList.remove('hidden');
            } else {
                showSection('transaction'); switchTab('purchase');
                getEl('input-date').value = String(t.date).substring(0,10); getEl('input-ticker').value = t.ticker; getEl('input-name').value = t.name; getEl('input-shares').value = t.shares; getEl('input-price').value = t.price;
                getEl('edit-id').value = id; getEl('save-btn').innerText = "수정 저장"; getEl('cancel-edit-btn').classList.remove('hidden');
                selectedTicker = t.ticker; updateQuickSelectUI();
            }
        };

        window.deleteTransaction = async (id) => {
            if(!confirm("정말로 이 기록을 삭제하시겠습니까?")) return;
            try {
                const target = transactions.find(x => String(x.id) === String(id));
                if(!target) return;
                await postMutation('delete', { id });
                removeLocalTransaction(id);
                primeMonthlyReportFromTransactions();
                saveLocalDataSnapshot();
                setSyncStatus('삭제 완료 · 백그라운드 동기화 중...');
                scheduleBackgroundSync('after-delete');
            } catch(e) {
                console.error(e);
                alert('삭제 실패: ' + (e?.message || '네트워크 오류'));
            }
        };

        window.openDetailModal = (ticker) => {
            const data = transactions.filter(t => String(t.ticker).trim() === ticker); if(data.length === 0) return;
            const tradeData = data.filter(t => !isDepositTransaction(t));
            const displayName = getTradeDisplayName(tradeData[0] || data[0]);
            safeSetText('modal-name', displayName); safeSetText('modal-ticker', ticker);
            detailModalTicker = ticker;
            detailModalName = displayName;

            const state = getPortfolioState();
            const alloc = state.holdings?.[ticker]?.alloc || { "1": 0, "2": 0, "3": 0 };
            const c1 = Number(alloc['1'] || 0);
            const c2 = Number(alloc['2'] || 0);
            const c3 = Number(alloc['3'] || 0);
            const tot = c1 + c2 + c3;
            const p1 = tot > 0 ? (c1 / tot) * 100 : 0;
            const p2 = tot > 0 ? (c2 / tot) * 100 : 0;
            const p3 = tot > 0 ? (c3 / tot) * 100 : 0;
            getEl('bar-invest-1').style.width = p1+"%"; getEl('bar-invest-2').style.width = p2+"%"; getEl('bar-reinvest').style.width = p3+"%";
            safeSetText('val-invest-1', `${Math.round(p1)}%`); safeSetText('val-invest-2', `${Math.round(p2)}%`); safeSetText('val-reinvest', `${Math.round(p3)}%`);
            const hBox = getEl('modal-history-list');
            if(hBox) hBox.innerHTML = tradeData.map(t => {
                const sharesNum = Number(t.shares || 0);
                const sideRaw = String(t?.side || t?.type || '').trim().toLowerCase();
                const isSell = sideRaw === 'sell' || sideRaw === '매도' || sharesNum < 0;
                const labelClass = isSell ? 'text-blue-500' : 'text-rose-500';
                const labelText = isSell ? '매도' : '매수';
                return `<div class="bg-slate-800/5 p-4 rounded-xl border border-slate-100 flex justify-between items-center text-[10px] font-black text-left"><div class="text-left"><p class="text-[8px] mb-1 font-sans"><span class="text-slate-500">${escapeHtml(String(t.date).substring(0,10))} · </span><span class="${labelClass}">${labelText}</span></p><p class="text-slate-900 font-sans">₩${Number(t.price).toLocaleString()} · ${Math.abs(sharesNum)}주</p></div><button type="button" data-action="delete" data-id="${escapeHtml(t.id)}" class="text-slate-300 hover:text-rose-500 transition font-sans"><svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button></div>`;
            }).join('');
            if(getEl('detail-trade-date')) getEl('detail-trade-date').value = getLocalDateInputValue();
            const lastPrice = Number(tradeData[tradeData.length - 1]?.price || marketData[ticker]?.price || 0);
            if(getEl('detail-trade-price')) getEl('detail-trade-price').value = lastPrice || '';
            if(getEl('detail-trade-shares')) getEl('detail-trade-shares').value = '';
            switchDetailTab('history');
            getEl('detail-modal')?.classList.remove('hidden');
        };

        window.runSimulationSelfTest = () => {
            const testMonth = getCurrentMonthKey();
            const sampleTx = [
                { id: 'd1', date: `${testMonth}-01`, ticker: 'DEPOSIT', name: '현금 입금', shares: 1, price: 100000, category: '3' },
                { id: 'b1', date: `${testMonth}-02`, ticker: 'TEST', name: '테스트ETF', shares: 10, price: 5000, category: 0 },
                { id: 's1', date: `${testMonth}-03`, ticker: 'TEST', name: '테스트ETF', shares: -2, price: 5500, category: 0, side: 'sell' }
            ];
            const closedTx = [
                { id: 'd2', date: `${testMonth}-01`, ticker: 'DEPOSIT', name: '현금 입금', shares: 1, price: 100000, category: '1' },
                { id: 'b2', date: `${testMonth}-02`, ticker: 'CLOSED', name: '청산테스트', shares: 10, price: 1000, category: 0, side: 'buy' },
                { id: 's2', date: `${testMonth}-03`, ticker: 'CLOSED', name: '청산테스트', shares: -10, price: 1500, category: 0, side: 'sell' }
            ];
            const oldTradeEnteredNow = {
                id: 'hist-old',
                date: '2024-01-01',
                ticker: 'HIST',
                name: '날짜필터',
                shares: 1,
                price: 1000,
                category: 0,
                side: 'buy',
                createdAtMs: Date.now()
            };

            const state = simulatePortfolioState(sampleTx);
            const closedState = simulatePortfolioState(closedTx);
            const report = getCurrentMonthReport(sampleTx, testMonth);
            const currentHistoryFilter = historyFilterDays;
            historyFilterDays = '30';
            const filteredOldTrade = filterHistoryByRange([oldTradeEnteredNow]);
            historyFilterDays = currentHistoryFilter;

            const checks = [
                { name: '보유수량 계산', pass: Math.abs((state.holdings.TEST?.shares || 0) - 8) < 0.0001 },
                { name: '청산 원가 계산', pass: getOpenPositionCostBasis(closedState.holdings) === 0 },
                { name: '거래일 필터 계산', pass: filteredOldTrade.length === 0 },
                { name: '월간 매수 집계', pass: report.buyActionCount === 1 && report.buyShares >= 10 },
                { name: '월간 매도 집계', pass: report.sellActionCount === 1 && report.sellShares >= 2 },
                { name: '배당 집행률 계산', pass: report.dividendIn >= report.dividendUsed }
            ];
            const failed = checks.filter(c => !c.pass);
            const resultText = failed.length === 0
                ? `✅ 테스트 통과 (${checks.length}/${checks.length})`
                : `❌ 테스트 실패 (${checks.length - failed.length}/${checks.length}) · ${failed.map(f => f.name).join(', ')}`;
            const resultEl = getEl('simulation-test-result');
            if (resultEl) {
                resultEl.classList.remove('text-rose-600', 'text-emerald-600', 'text-slate-400');
                resultEl.classList.add(failed.length === 0 ? 'text-emerald-600' : 'text-rose-600');
                resultEl.innerText = resultText;
            }
        };

        document.addEventListener('click', (e) => {
            const target = e.target.closest('button, .holding-item');
            if(!target) return;

            if(target.classList.contains('history-filter-btn') && target.dataset.historyFilter) {
                historyFilterDays = target.dataset.historyFilter;
                historyVisibleCount = 100;
                renderHistoryList('history-list', transactions);
                return;
            }

            if(target.id === 'history-load-more') {
                historyVisibleCount += 100;
                renderHistoryList('history-list', transactions);
                return;
            }

            if(target.dataset.action === 'monthly-prev') {
                currentMonthlyModeKey = shiftMonthKey(currentMonthlyModeKey || getCurrentMonthKey(), -1);
                updateUI();
                void loadMonthlyReportFromFirebase(currentMonthlyModeKey).then(() => updateUI());
                return;
            }

            if(target.dataset.action === 'monthly-next') {
                const next = shiftMonthKey(currentMonthlyModeKey || getCurrentMonthKey(), 1);
                const currentKey = getCurrentMonthKey();
                if (next > currentKey) return;
                currentMonthlyModeKey = next;
                updateUI();
                void loadMonthlyReportFromFirebase(currentMonthlyModeKey).then(() => updateUI());
                return;
            }

            if(target.dataset.action === 'monthly-toggle-buy') {
                monthlyBreakdownOpen.buy = !monthlyBreakdownOpen.buy;
                saveMonthlyBreakdownState(currentMonthlyModeKey || getCurrentMonthKey(), monthlyBreakdownOpen);
                updateUI();
                return;
            }

            if(target.dataset.action === 'monthly-toggle-sell') {
                monthlyBreakdownOpen.sell = !monthlyBreakdownOpen.sell;
                saveMonthlyBreakdownState(currentMonthlyModeKey || getCurrentMonthKey(), monthlyBreakdownOpen);
                updateUI();
                return;
            }

            if(target.dataset.action === 'monthly-toggle-dividend') {
                monthlyBreakdownOpen.dividend = !monthlyBreakdownOpen.dividend;
                saveMonthlyBreakdownState(currentMonthlyModeKey || getCurrentMonthKey(), monthlyBreakdownOpen);
                updateUI();
                return;
            }

            if(target.classList.contains('holding-item')) {
                const ticker = target.dataset.ticker;
                if(ticker) openDetailModal(ticker);
                return;
            }

            if(target.classList.contains('quick-select-btn')) {
                const ticker = target.dataset.ticker;
                if(ticker) fillForm(ticker);
                return;
            }

            const action = target.dataset.action;
            if(action === 'edit' && target.dataset.id) {
                editTransaction(target.dataset.id);
                return;
            }
            if(action === 'delete' && target.dataset.id) {
                deleteTransaction(target.dataset.id);
            }
        });

        window.showSection = (id) => {
            ['dashboard','history','transaction'].forEach(s => { getEl('section-'+s)?.classList.add('hidden'); });
            getEl('section-'+id)?.classList.remove('hidden');
            document.querySelectorAll('.nav-item').forEach(b => { b.classList.remove('text-blue-600'); b.classList.add('text-slate-300'); });
            getEl('mob-nav-'+id)?.classList.add('text-blue-600'); getEl('mob-nav-'+id)?.classList.remove('text-slate-300');
            document.querySelectorAll('.pc-nav-item').forEach(b => b.classList.remove('text-blue-600', 'border-r-4', 'border-blue-600'));
            getEl('pc-nav-'+id)?.classList.add('text-blue-600', 'border-r-4', 'border-blue-600');
            if(id === 'transaction') updateQuickSelectUI();
        };
        
        window.openSettings = () => { const m = getEl('settings-modal'); if(!m) return; if(getEl('setting-url')) getEl('setting-url').value = sheetsUrl; if(getEl('setting-firebase-config')) getEl('setting-firebase-config').value = firebaseConfigRaw; if(getEl('setting-firebase-collection')) getEl('setting-firebase-collection').value = firebaseCollection; m.classList.remove('hidden'); };
        window.closeSettings = () => getEl('settings-modal')?.classList.add('hidden');
        window.hardRefreshApp = async () => {
            try {
                localStorage.removeItem('isa_monthly_review_snapshot');
                localStorage.removeItem(LOCAL_DATA_CACHE_KEY);
                localStorage.removeItem(MONTHLY_REPORT_CACHE_KEY);
                monthlyReportCache.clear();
                portfolioStateCache = null;
                portfolioStateCacheVersion = -1;

                if (typeof caches !== 'undefined' && caches?.keys) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((key) => caches.delete(key)));
                }
                if (navigator?.serviceWorker?.getRegistrations) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map((r) => r.unregister()));
                }
            } catch (e) {
                console.warn('hardRefreshApp cleanup warning:', e);
            }
            const cacheBust = `_hard_reload=${Date.now()}`;
            const url = `${location.pathname}?${cacheBust}${location.hash || ''}`;
            location.replace(url);
        };
        window.saveSettings = () => {
            const urlInput = getEl('setting-url');
            const firebaseInput = getEl('setting-firebase-config');
            const collectionInput = getEl('setting-firebase-collection');
            if(!urlInput || !firebaseInput || !collectionInput) return;

            const candidate = urlInput.value.trim();
            const nextSheetsUrl = isValidSheetsUrl(candidate) ? candidate : '';

            const nextFirebaseConfigRaw = firebaseInput.value.trim() || JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2);
            const parsedFirebase = parseFirebaseConfig(nextFirebaseConfigRaw);
            if(nextFirebaseConfigRaw && !parsedFirebase) {
                alert('파이어베이스 설정값 형식이 잘못됐어요.\n프로젝트 설정 > 웹 앱 구성값(JSON)을 그대로 붙여넣어 주세요.');
                return;
            }

            const nextCollection = (collectionInput.value.trim() || 'isa_history').replace(/\s+/g, '_');

            sheetsUrl = nextSheetsUrl;
            firebaseConfigRaw = nextFirebaseConfigRaw;
            firebaseCollection = nextCollection;

            localStorage.setItem('isa_sheets_url', sheetsUrl);
            if(candidate && !nextSheetsUrl) {
                alert('가격 URL이 유효하지 않아 가격 동기화는 비활성화되고, 기록만 동기화됩니다.');
            }
            localStorage.setItem('isa_firebase_config', firebaseConfigRaw);
            localStorage.setItem('isa_firebase_collection', firebaseCollection);

            if(!initFirebase()) {
                alert('파이어베이스 연결 실패: 설정값을 다시 확인해 주세요.');
                return;
            }
            closeSettings();
            syncAllData();
        };
        window.openCashModal = () => getEl('cash-modal')?.classList.remove('hidden');
        window.closeCashModal = () => getEl('cash-modal')?.classList.add('hidden');
        window.closeDetailModal = () => {
            getEl('detail-modal')?.classList.add('hidden');
            detailModalTicker = "";
            detailModalName = "";
            switchDetailTab('history');
        };

        
// ===== Count Up Animation =====
function animateValue(id, start, end, duration) {
    const el = document.getElementById(id);
    if (!el) return;
    if (document.hidden || lowPowerMode) {
        el.innerText = '₩' + Math.round(end).toLocaleString();
        return;
    }
    const range = end - start;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = Math.floor(start + range * progress);
        el.innerText = '₩' + value.toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}


function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

    navigator.serviceWorker.register('./service-worker.js').then((registration) => {
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                    setSyncStatus('앱 업데이트 준비 완료');
                }
            });
        });
    }).catch((err) => {
        console.warn('Service worker registration failed:', err);
    });
}


window.onload = () => {
            const today = getLocalDateInputValue();
            if(getEl('input-date')) getEl('input-date').value = today;
            if(getEl('div-date')) getEl('div-date').value = today;
            applyLowPowerMode(lowPowerMode);
            applyAppVersion();
            initFirebase();
            restorePendingTransactions();
            setDepositCat(3);
            restoreLocalDataSnapshot();
            syncAllData();
            registerServiceWorker();

            const debugSwReset = localStorage.getItem('isa_debug_sw_reset') === '1';
            if (debugSwReset && 'serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations()
                    .then((regs) => regs.forEach((reg) => reg.unregister()))
                    .catch((err) => console.warn('Service worker unregister failed:', err));
            }

            const autoRunSelfTest = new URLSearchParams(window.location.search).get('selftest') === '1'
                || localStorage.getItem('isa_auto_self_test') === '1';
            if (autoRunSelfTest && typeof window.runSimulationSelfTest === 'function') {
                setTimeout(() => window.runSimulationSelfTest(), 0);
            }
        };
        document.addEventListener('visibilitychange', () => {
            document.body.classList.toggle('motion-enabled', shouldAnimateUi());
        });
