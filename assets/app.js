        const APP_VERSION = "1.0.34";
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

        const MONTHLY_PLAN_BUDGET = 500000;
        const TRADE_FEE_RATE = 0.00015;
        const ISA_PLAN = {
            primaryEngine: { ticker: '486290', targetTicker: '360750', fallbackTargetValue: 2450000, role: '주엔진' },
            secondaryEngine: { ticker: '474220', targetTicker: '458730', fallbackTargetValue: 1950000, role: '보조엔진' },
            growthTargets: [
                { ticker: '360750', role: '본체', weight: 0.6, fallbackName: 'S&P500' },
                { ticker: '133690', role: '성장 가속기', weight: 0.2, fallbackName: '나스닥100' },
                { ticker: '458730', role: '배당성장', weight: 0.2, fallbackName: '순수슈드' }
            ]
        };
        const PLAN_BUCKET_META = {
            primaryDividend: { ticker: '360750', role: '초고배당 배당', fallbackName: 'S&P500', note: '486290 배당 전용' },
            secondaryDividend: { ticker: '458730', role: '보조배당', fallbackName: '순수슈드', note: '474220 배당 전용' },
            unassignedDividend: { ticker: '360750', role: '미지정 배당', fallbackName: 'S&P500', note: '배당 종목을 지정하면 더 정확해요' },
            principalSp500: { ticker: '360750', role: '원금/특별금 60%', fallbackName: 'S&P500', note: '본체 버킷' },
            principalNasdaq: { ticker: '133690', role: '원금/특별금 20%', fallbackName: '나스닥100', note: '성장 버킷' },
            principalSchd: { ticker: '458730', role: '원금/특별금 20%', fallbackName: '순수슈드', note: '배당성장 버킷' }
        };
        const PLAN_BUCKET_ORDER = ['primaryDividend', 'secondaryDividend', 'unassignedDividend', 'principalSp500', 'principalNasdaq', 'principalSchd'];
        const PENDING_TX_STORAGE_KEY = 'isa_pending_transactions_v1';
        const LOCAL_DATA_CACHE_KEY = 'isa_local_data_cache_v1';
        const LOCAL_DATA_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
        const PRICE_DATA_CACHE_KEY = 'isa_price_data_cache_v1';
        const PRICE_DATA_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
        const MONTHLY_REPORT_CACHE_KEY = 'isa_monthly_report_cache_v1';
        const MONTHLY_REPORT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
        const IMPORT_TICKER_ALIASES = {
            '0183J0': ['TIGER 미국우주테크', '미국우주테크', '우주테크', '우주'],
            '486290': ['TIGER 미국나스닥100 타겟데일리커버드콜', '미국나스닥100 타겟데일리커버드콜', '나스닥100 타겟데일리커버드콜', '타겟데일리커버드콜', '초고배당', '제피'],
            '379810': ['KODEX 미국나스닥100', 'KODEX 미국나스닥100TR'],
            '458730': ['TIGER 미국배당다우존스', '미국배당다우존스', '배당다우존스', '순수슈드', 'SCHD'],
            '474220': ['TIGER 미국테크TOP10타겟커버드콜', '미국테크TOP10타겟커버드콜', '테크TOP10타겟커버드콜', '고배당'],
            '360750': ['TIGER 미국S&P500', '미국S&P500', 'S&P500']
        };
        const PRICE_CACHE_URL = String(window.ISARICH_CONFIG?.priceCacheUrl || '').trim();
        function deriveTradeExtractUrl() {
            const configured = String(window.ISARICH_CONFIG?.tradeExtractUrl || '').trim();
            if (configured) return configured;
            if (!PRICE_CACHE_URL) return '';
            try {
                const url = new URL(PRICE_CACHE_URL, window.location.href);
                url.pathname = '/extract-trades';
                url.search = '';
                url.hash = '';
                return url.toString();
            } catch (e) {
                return '';
            }
        }
        const TRADE_EXTRACT_URL = deriveTradeExtractUrl();

        let transactions = [];
        let pendingTransactions = new Map();
        let marketData = {};
        let assetChart = null;
        let totalBuyAmount = 0;
        let backgroundSyncTimer = null;
        let priceDataMeta = { status: 'idle', updatedAt: '', savedAt: 0, stale: false };

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
        let historyRenderSignature = '';
        let historyNeedsRender = true;
        let currentTransactionMode = 'buy';
        let aiRecommendationExpanded = false;
        let assetAllocationExpanded = false;
        let importRows = [];
        let importLastCostEstimate = null;
        let xlsxLoaderPromise = null;
        const IMPORT_AI_COST_METER_KEY = 'isa_import_ai_cost_meter_v1';
        let monthlyBreakdownOpen = { buy: false, sell: false, dividend: false };
        let syncStatusText = '동기화 대기 중';
        let syncStatusTone = 'info';
        let syncStatusDetail = '가격 상태 대기 중';
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
        let settingsPreviousFocus = null;
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

        function isUsablePriceData(value) {
            if (!isPlainObject(value)) return false;
            return Object.values(value).some((item) => {
                const price = Number(item?.price || 0);
                return Number.isFinite(price) && price > 0;
            });
        }

        function rememberPriceData(data, meta = {}) {
            if (!isUsablePriceData(data)) return null;
            priceDataMeta = {
                status: String(meta.status || 'fresh'),
                updatedAt: String(meta.updatedAt || new Date().toISOString()),
                savedAt: Number(meta.savedAt || Date.now()),
                stale: Boolean(meta.stale)
            };
            writeJsonStorage(PRICE_DATA_CACHE_KEY, {
                savedAt: priceDataMeta.savedAt,
                updatedAt: priceDataMeta.updatedAt,
                status: priceDataMeta.status,
                data
            });
            return data;
        }

        function readRememberedPriceData(maxAgeMs = PRICE_DATA_CACHE_MAX_AGE_MS) {
            const cached = readJsonStorage(PRICE_DATA_CACHE_KEY, null);
            const savedAt = Number(cached?.savedAt || 0);
            const data = cached?.data;
            if (!savedAt || Date.now() - savedAt > maxAgeMs || !isUsablePriceData(data)) return null;
            return {
                data,
                savedAt,
                updatedAt: String(cached?.updatedAt || ''),
                status: String(cached?.status || 'stored')
            };
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
            const rememberedPrices = readRememberedPriceData();
            writeJsonStorage(LOCAL_DATA_CACHE_KEY, {
                savedAt: Date.now(),
                transactions,
                marketData: isUsablePriceData(marketData) ? marketData : (rememberedPrices?.data || {})
            });
        }

        function restoreLocalDataSnapshot() {
            const cached = readJsonStorage(LOCAL_DATA_CACHE_KEY, null);
            const savedAt = Number(cached?.savedAt || 0);
            if (!savedAt) return false;
            const cacheIsFresh = Date.now() - savedAt <= LOCAL_DATA_CACHE_MAX_AGE_MS;

            const cachedTransactions = Array.isArray(cached.transactions) ? cached.transactions.map((item) => toHistoryRecord(item, item.source || 'cache')) : [];
            const rememberedPrices = readRememberedPriceData();
            const useSnapshotPrices = cacheIsFresh && isUsablePriceData(cached.marketData);
            const cachedMarketData = useSnapshotPrices
                ? cached.marketData
                : (rememberedPrices?.data || {});
            const cachedPriceMeta = useSnapshotPrices
                ? { savedAt, updatedAt: new Date(savedAt).toISOString(), status: 'local' }
                : rememberedPrices;

            if (!cachedTransactions.length && !Object.keys(cachedMarketData).length) return false;

            transactions = mergePendingTransactions(cachedTransactions);
            marketData = cachedMarketData;
            if (isUsablePriceData(marketData)) {
                rememberPriceData(marketData, {
                    status: cachedPriceMeta?.status || 'local',
                    savedAt: Number(cachedPriceMeta?.savedAt || Date.now()),
                    updatedAt: cachedPriceMeta?.updatedAt || new Date().toISOString()
                });
            }
            transactionsVersion += 1;
            invalidateMonthlyReportCaches();
            primeMonthlyReportFromTransactions();
            updateUI();
            updateQuickSelectUI();
            updateDividendTickerOptions();
            setSyncStatus('저장된 데이터 표시 중...', 'warn', '네트워크 대신 로컬 저장 데이터를 표시하고 있습니다.');
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
            const response = await fetchWithTimeout(url, { redirect: 'follow' }, 18000);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const text = await response.text();
            const payload = JSON.parse(text || "{}");
            const data = normalizePricePayload(payload);
            if (!isUsablePriceData(data)) {
                throw new Error('PRICE_DATA_EMPTY');
            }
            return rememberPriceData(data, {
                status: response.headers.get('X-ISARICH-Cache') || 'fresh',
                updatedAt: response.headers.get('X-ISARICH-Updated-At') || new Date().toISOString()
            });
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

        function formatWon(value) {
            return `₩${Math.round(Number(value || 0)).toLocaleString()}`;
        }

        function getMarketPrice(ticker) {
            const price = Number(marketData?.[ticker]?.price || 0);
            return Number.isFinite(price) && price > 0 ? price : 0;
        }

        function getMarketName(ticker, fallback = '') {
            return String(marketData?.[ticker]?.name || fallback || ticker || '').trim();
        }

        function getMarketYieldPct(ticker) {
            let yieldPct = Number(marketData?.[ticker]?.yield || 0);
            if (!Number.isFinite(yieldPct) || yieldPct <= 0) return 0;
            if (yieldPct < 1) yieldPct *= 100;
            return yieldPct;
        }

        function getHoldingValue(holdings, ticker) {
            const shares = Number(holdings?.[ticker]?.shares || 0);
            const price = getMarketPrice(ticker);
            return shares > 0 && price > 0 ? shares * price : 0;
        }

        function getEngineStatus(holdings, engineConfig) {
            const engineTicker = engineConfig.ticker;
            const targetTicker = engineConfig.targetTicker;
            const currentValue = getHoldingValue(holdings, engineTicker);
            const engineYield = getMarketYieldPct(engineTicker);
            const targetMonthlyCash = getMarketPrice(targetTicker);
            const targetValue = engineYield > 0 && targetMonthlyCash > 0
                ? targetMonthlyCash / (engineYield / 100 / 12)
                : Number(engineConfig.fallbackTargetValue || 0);
            const monthlyCash = currentValue * (engineYield / 100 / 12);

            return {
                ...engineConfig,
                currentValue,
                monthlyCash,
                targetValue,
                targetMonthlyCash,
                deficit: Math.max(0, targetValue - currentValue)
            };
        }

        function createEmptyPlanBuckets() {
            return PLAN_BUCKET_ORDER.reduce((acc, key) => {
                acc[key] = 0;
                return acc;
            }, {});
        }

        function createEmptyCashAlloc() {
            return { "1": 0, "2": 0, "3": 0 };
        }

        function distributeAmountBySource(amount, source, keys, fallbackKey) {
            const cleanAmount = roundMoney(Math.max(0, Number(amount || 0)));
            const result = (keys || []).reduce((acc, key) => {
                acc[key] = 0;
                return acc;
            }, {});
            if (cleanAmount <= 0) return result;

            const activeKeys = (keys || []).filter(key => Number(source?.[key] || 0) > 0);
            const total = activeKeys.reduce((sum, key) => sum + Number(source?.[key] || 0), 0);
            if (total <= 0) {
                const safeFallback = result[fallbackKey] !== undefined ? fallbackKey : keys?.[0];
                if (safeFallback) result[safeFallback] = cleanAmount;
                return result;
            }

            let assigned = 0;
            activeKeys.forEach((key, index) => {
                const isLast = index === activeKeys.length - 1;
                const value = isLast ? roundMoney(cleanAmount - assigned) : roundMoney(cleanAmount * (Number(source[key] || 0) / total));
                result[key] = value;
                assigned = roundMoney(assigned + value);
            });
            return result;
        }

        function addBucketAlloc(target, source) {
            PLAN_BUCKET_ORDER.forEach((key) => {
                const value = Number(source?.[key] || 0);
                if (value > 0) target[key] = roundMoney(Number(target[key] || 0) + value);
            });
        }

        function getFallbackPlanBucketForTicker(ticker) {
            if (ticker === '360750') return 'principalSp500';
            if (ticker === '133690') return 'principalNasdaq';
            if (ticker === '458730') return 'principalSchd';
            return 'principalSp500';
        }

        function addToPlanBucket(buckets, key, amount) {
            if (!buckets || !Object.prototype.hasOwnProperty.call(buckets, key)) return;
            const cleanAmount = Number(amount || 0);
            if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) return;
            buckets[key] = roundMoney(Number(buckets[key] || 0) + cleanAmount);
        }

        function splitPrincipalToPlanBuckets(buckets, amount) {
            const cleanAmount = Math.max(0, Math.floor(Number(amount || 0)));
            if (!cleanAmount) return;
            const sp500 = Math.floor(cleanAmount * 0.6);
            const nasdaq = Math.floor(cleanAmount * 0.2);
            const schd = cleanAmount - sp500 - nasdaq;
            addToPlanBucket(buckets, 'principalSp500', sp500);
            addToPlanBucket(buckets, 'principalNasdaq', nasdaq);
            addToPlanBucket(buckets, 'principalSchd', schd);
        }

        function addDepositToPlanBuckets(buckets, tx, amount) {
            const cat = normalizeCashCategory(tx?.category);
            const ticker = String(tx?.ticker || '').trim();
            if (cat === '3') {
                if (ticker === ISA_PLAN.primaryEngine.ticker) {
                    addToPlanBucket(buckets, 'primaryDividend', amount);
                } else if (ticker === ISA_PLAN.secondaryEngine.ticker) {
                    addToPlanBucket(buckets, 'secondaryDividend', amount);
                } else {
                    addToPlanBucket(buckets, 'unassignedDividend', amount);
                }
                return;
            }
            splitPrincipalToPlanBuckets(buckets, amount);
        }

        function consumePlanBuckets(buckets, bucketKeys, amount) {
            let remain = roundMoney(Math.max(0, Number(amount || 0)));
            const usedByBucket = createEmptyPlanBuckets();
            (bucketKeys || []).forEach((key) => {
                if (remain <= 0 || !buckets || !Object.prototype.hasOwnProperty.call(buckets, key)) return;
                const used = Math.min(Number(buckets[key] || 0), remain);
                buckets[key] = roundMoney(Number(buckets[key] || 0) - used);
                usedByBucket[key] = roundMoney(Number(usedByBucket[key] || 0) + used);
                remain = roundMoney(remain - used);
            });
            return { remain, usedByBucket };
        }

        function getPlanBucketConsumeOrderForBuy(ticker) {
            if (ticker === '360750') return ['primaryDividend', 'unassignedDividend', 'principalSp500'];
            if (ticker === '458730') return ['secondaryDividend', 'principalSchd'];
            if (ticker === '133690') return ['principalNasdaq'];
            return PLAN_BUCKET_ORDER;
        }

        function reconcilePlanBucketsToCash(buckets, cash) {
            const totalCash = ['1', '2', '3'].reduce((sum, key) => sum + Number(cash?.[key] || 0), 0);
            const bucketTotal = PLAN_BUCKET_ORDER.reduce((sum, key) => sum + Number(buckets?.[key] || 0), 0);
            const diff = roundMoney(totalCash - bucketTotal);
            if (diff > 0) {
                splitPrincipalToPlanBuckets(buckets, diff);
            } else if (diff < 0) {
                consumePlanBuckets(buckets, [...PLAN_BUCKET_ORDER].reverse(), Math.abs(diff));
            }
        }

        function allocatePlanBudget(targets, budget) {
            const cleanTargets = (targets || []).map((target, index) => {
                const price = getMarketPrice(target.ticker);
                return {
                    ...target,
                    index,
                    price,
                    name: getMarketName(target.ticker, target.fallbackName),
                    qty: 0,
                    spend: 0
                };
            });

            const tradableTargets = cleanTargets.filter(target => target.price > 0 && Number(target.weight || 0) > 0);
            const totalWeight = tradableTargets.reduce((sum, target) => sum + Number(target.weight || 0), 0);
            let remain = Math.max(0, Math.floor(Number(budget || 0)));

            tradableTargets.forEach(target => {
                const targetBudget = totalWeight > 0 ? Math.floor(budget * (Number(target.weight || 0) / totalWeight)) : 0;
                const qty = Math.max(0, Math.floor(targetBudget / target.price));
                target.qty = qty;
                target.spend = qty * target.price;
                remain -= target.spend;
            });

            const sortedByPriority = [...tradableTargets].sort((a, b) => a.index - b.index);
            let guard = 0;
            while (sortedByPriority.length && guard < 1000) {
                const next = sortedByPriority.find(target => remain >= target.price);
                if (!next) break;
                next.qty += 1;
                next.spend += next.price;
                remain -= next.price;
                guard += 1;
            }

            return cleanTargets;
        }

        function buildPlanBucketRow(bucketKey, balance) {
            const meta = PLAN_BUCKET_META[bucketKey] || {};
            const cleanBalance = Math.max(0, Math.floor(Number(balance || 0)));
            const price = getMarketPrice(meta.ticker);
            const qty = price > 0 ? Math.floor(cleanBalance / price) : 0;
            const spend = qty * price;
            const remain = Math.max(0, cleanBalance - spend);
            const shortfall = price > 0 && qty <= 0 ? Math.max(0, price - cleanBalance) : 0;
            const waitText = qty > 0
                ? `남음 ${formatWon(remain)}`
                : (price > 0 ? `1주까지 ${formatWon(shortfall)} 부족` : '가격 연동 필요');
            return {
                bucketKey,
                ticker: meta.ticker,
                role: meta.role,
                fallbackName: meta.fallbackName,
                name: getMarketName(meta.ticker, meta.fallbackName),
                note: `${meta.note || '전용 버킷'} · 버킷 ${formatWon(cleanBalance)} · ${waitText}`,
                price,
                balance: cleanBalance,
                qty,
                spend,
                remain,
                isBucket: true
            };
        }

        function buildVirtualMonthlyBuckets() {
            const buckets = createEmptyPlanBuckets();
            splitPrincipalToPlanBuckets(buckets, MONTHLY_PLAN_BUDGET);
            return buckets;
        }

        function buildIsaPlanRecommendation(portfolioState, fallbackCash = 0) {
            const holdings = portfolioState?.holdings || portfolioState || {};
            const cashState = portfolioState?.cash || {};
            const stateCash = ['1', '2', '3'].reduce((sum, key) => sum + Number(cashState[key] || 0), 0);
            const cash = Math.max(0, Math.floor(stateCash || Number(fallbackCash || 0)));
            const primary = getEngineStatus(holdings, ISA_PLAN.primaryEngine);
            const secondary = getEngineStatus(holdings, ISA_PLAN.secondaryEngine);
            const primaryDone = primary.deficit <= Math.max(getMarketPrice(primary.ticker), 1);
            const secondaryDone = secondary.deficit <= Math.max(getMarketPrice(secondary.ticker), 1);

            const engineTargets = [];
            if (!primaryDone) {
                engineTargets.push({
                    ticker: primary.ticker,
                    role: primary.role,
                    weight: 0.5,
                    fallbackName: '초고배당',
                    note: `목표까지 ${formatWon(primary.deficit)}`
                });
            }
            if (!secondaryDone) {
                engineTargets.push({
                    ticker: secondary.ticker,
                    role: secondary.role,
                    weight: 0.4,
                    fallbackName: '고배당',
                    note: `목표까지 ${formatWon(secondary.deficit)}`
                });
            }
            if (!primaryDone || !secondaryDone) {
                engineTargets.push({
                    ticker: '360750',
                    role: '본체 씨앗',
                    weight: 0.1,
                    fallbackName: 'S&P500',
                    note: '엔진 완성 전에도 조금씩 적립'
                });
            }

            const phase = !primaryDone || !secondaryDone ? '엔진 완성 전' : '엔진 완성 후';
            if (engineTargets.length) {
                const budget = cash;
                return {
                    phase,
                    mode: 'engine',
                    budget,
                    budgetSource: '현재 현금 기준',
                    summaryText: '엔진 완성 전에는 현금과 특별금을 주엔진/보조엔진 완성에 먼저 사용합니다.',
                    primary,
                    secondary,
                    rows: allocatePlanBudget(engineTargets, budget)
                };
            }

            const actualBuckets = portfolioState?.planBuckets || createEmptyPlanBuckets();
            const actualBucketTotal = PLAN_BUCKET_ORDER.reduce((sum, key) => sum + Number(actualBuckets[key] || 0), 0);
            const buckets = actualBucketTotal > 0 ? actualBuckets : createEmptyPlanBuckets();
            const rows = PLAN_BUCKET_ORDER
                .map((key) => buildPlanBucketRow(key, buckets[key]))
                .filter((row) => actualBucketTotal <= 0 ? row.bucketKey === 'principalSp500' : row.balance > 0);
            const budget = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);

            return {
                phase,
                mode: 'bucket',
                budget,
                budgetSource: actualBucketTotal > 0 ? '출처별 버킷 기준' : '월 50만원 기준',
                summaryText: '완성 후에는 배당 출처와 원금/특별금을 분리해서, 못 산 금액은 해당 버킷에 대기시킵니다.',
                primary,
                secondary,
                rows
            };
        }

        function getAiPanelStateClass() {
            return aiRecommendationExpanded ? 'is-expanded' : 'is-collapsed';
        }

        function renderAiRecommendationToggle(summary) {
            return `
                <button type="button" class="ai-reco-summary-toggle" onclick="toggleAiRecommendation(event)">
                    <span>${escapeHtml(summary || '추천 내용을 확인해보세요')}</span>
                    <strong class="ai-reco-toggle-label">${aiRecommendationExpanded ? '접기' : '펼치기'}</strong>
                </button>
            `;
        }

        function applyAiRecommendationCollapsedState() {
            document.querySelectorAll('.ai-reco-panel').forEach((panel) => {
                panel.classList.toggle('is-expanded', aiRecommendationExpanded);
                panel.classList.toggle('is-collapsed', !aiRecommendationExpanded);
            });
            document.querySelectorAll('.ai-reco-toggle-label').forEach((label) => {
                label.innerText = aiRecommendationExpanded ? '접기' : '펼치기';
            });
        }

        window.toggleAiRecommendation = (event) => {
            event?.stopPropagation?.();
            aiRecommendationExpanded = !aiRecommendationExpanded;
            applyAiRecommendationCollapsedState();
        };

        function updateAssetAllocationUI() {
            const card = getEl('asset-allocation-card');
            if (!card) return;
            card.classList.toggle('is-expanded', assetAllocationExpanded);
            safeSetText('asset-allocation-state', assetAllocationExpanded ? '접기' : '펼치기');
            if (assetAllocationExpanded && assetChart) {
                requestAnimationFrame(() => {
                    try {
                        assetChart.resize();
                        assetChart.update('none');
                    } catch (error) {
                        console.warn('Asset chart resize skipped.', error);
                    }
                });
            }
        }

        window.toggleAssetAllocation = () => {
            assetAllocationExpanded = !assetAllocationExpanded;
            updateAssetAllocationUI();
        };

        function renderIsaPlanRecommendation(plan) {
            const rows = (plan.rows || []).filter(row => Number(row.price || 0) > 0);
            const buyRows = rows.filter(row => Number(row.qty || 0) > 0);
            const confidence = buyRows.length ? 86 : 78;
            const confidenceWidth = Math.max(8, Math.min(100, confidence));
            if (buyRows.length) {
                const row = buyRows[0];
                return `
                    <div class="ai-reco-panel buy-reco-card-now ${getAiPanelStateClass()}">
                        ${renderAiRecommendationToggle(`${row.name || row.ticker} ${Number(row.qty || 0).toLocaleString()}주 후보`)}
                        <h3>오늘은 <strong>${escapeHtml(row.name || row.ticker)}</strong><br>비중 보강을 제안해요</h3>
                        <div class="ai-reco-metrics">
                            <div><span>추천 수량</span><strong>${Number(row.qty || 0).toLocaleString()}주</strong></div>
                            <div><span>가용 예산</span><strong>${formatWon(plan.budget || 0)}</strong></div>
                        </div>
                        <div class="ai-confidence">
                            <div><span>신뢰도</span><strong>${confidence}%</strong></div>
                            <i style="width:${confidenceWidth}%"></i>
                        </div>
                        <button type="button" class="ai-reco-action" onclick="openRecommendedTrade(${escapeHtml(JSON.stringify(String(row.ticker || '')))}, ${Number(row.qty || 0)})">거래 입력하기 <span>›</span></button>
                    </div>
                `;
            }

            const nextRows = rows
                .map(row => {
                    const available = row.isBucket ? Number(row.balance || 0) : Number(plan.budget || 0);
                    return {
                        ...row,
                        shortfall: Math.max(0, Number(row.price || 0) - available),
                        available
                    };
                })
                .filter(row => row.shortfall > 0);
            const next = nextRows.length
                ? [...nextRows].sort((a, b) => a.shortfall - b.shortfall)[0]
                : rows[0];
            if (!next) {
                return `
                    <div class="ai-reco-panel buy-reco-card-wait ${getAiPanelStateClass()}">
                        ${renderAiRecommendationToggle('가격 데이터 수신 후 추천 계산')}
                        <h3>가격 데이터가 들어오면<br>추천을 다시 계산할게요</h3>
                    </div>
                `;
            }

            return `
                <div class="ai-reco-panel buy-reco-card-wait ${getAiPanelStateClass()}">
                    ${renderAiRecommendationToggle(`${next.name || next.ticker} 부족 ${formatWon(next.shortfall || 0)}`)}
                    <h3>오늘은 <strong>${escapeHtml(next.name || next.ticker)}</strong><br>비중 보강을 제안해요</h3>
                    <div class="ai-reco-metrics">
                        <div><span>부족 금액</span><strong>${formatWon(next.shortfall || 0)}</strong></div>
                        <div><span>기준</span><strong>${escapeHtml(plan.budgetSource || '현금')}</strong></div>
                    </div>
                    <div class="ai-confidence">
                        <div><span>신뢰도</span><strong>${confidence}%</strong></div>
                        <i style="width:${confidenceWidth}%"></i>
                    </div>
                    <button type="button" class="ai-reco-action" onclick="openRecommendedTrade(${escapeHtml(JSON.stringify(String(next.ticker || '')))})">추천 상세 보기 <span>›</span></button>
                </div>
            `;
        }

        function getSortableTransactionDate(value) {
            const raw = String(value || '').trim();
            const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (match) {
                const year = Number(match[1]);
                const month = Number(match[2]);
                const day = Number(match[3]);
                if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                    return year * 10000 + month * 100 + day;
                }
            }
            const parsed = Date.parse(raw);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        function normalizeClockTime(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const isPm = /오후|p\.?m\.?/i.test(raw);
            const isAm = /오전|a\.?m\.?/i.test(raw);
            const match = raw.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})(?:\s*[:분]\s*(\d{1,2}))?/);
            if (!match) return '';
            let hour = Number(match[1]);
            const minute = Number(match[2]);
            const second = match[3] != null ? Number(match[3]) : 0;
            if (isPm && hour < 12) hour += 12;
            if (isAm && hour === 12) hour = 0;
            if (hour > 23 || minute > 59 || second > 59) return '';
            return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
        }

        function getTransactionTimeMs(tx) {
            const normalized = normalizeClockTime(tx?.time);
            if (!normalized) return -1;
            const [hour, minute, second] = normalized.split(':').map(Number);
            return ((hour * 60 + minute) * 60 + second) * 1000;
        }

        function getSortedTransactions(inputTransactions) {
            return [...(inputTransactions || [])].sort((a, b) => {
                const dateDiff = getSortableTransactionDate(a?.date) - getSortableTransactionDate(b?.date);
                if (dateDiff !== 0) return dateDiff;
                // 같은 날짜: 실제 체결 시각을 최우선으로 본다. 둘 다 시각이 있고 서로 다르면
                // 입금/매수/매도 종류와 무관하게 시각순 그대로 줄세운다.
                const timeA = getTransactionTimeMs(a);
                const timeB = getTransactionTimeMs(b);
                if (timeA >= 0 && timeB >= 0 && timeA !== timeB) return timeA - timeB;
                // 시각을 알 수 없거나(한쪽만 있거나 없음) 분 단위까지 같아 순서를 못 가리면
                // "입금은 매매보다 먼저" 규칙으로 현금이 음수가 되는 꼬임을 방지한다.
                const depositDiff = (isDepositTransaction(a) ? 0 : 1) - (isDepositTransaction(b) ? 0 : 1);
                if (depositDiff !== 0) return depositDiff;
                const createdAtDiff = Number(a?.createdAtMs || 0) - Number(b?.createdAtMs || 0);
                if (createdAtDiff !== 0) return createdAtDiff;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
        }

        function calculateTradeFee(shares, price) {
            const amount = Math.abs(Number(shares || 0) * Number(price || 0));
            return Number.isFinite(amount) && amount > 0 ? Math.ceil(amount * TRADE_FEE_RATE) : 0;
        }

        function getTransactionFee(tx) {
            const fee = Number(tx?.fee);
            return Number.isFinite(fee) && fee >= 0 ? roundMoney(fee) : 0;
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
            const planBuckets = createEmptyPlanBuckets();
            const holdings = {};
            let totalBuyAmount = 0;

            sortedTx.forEach((tx) => {
                const shares = roundShares(tx?.shares || 0);
                const price = Number(tx?.price || 0);
                if (!Number.isFinite(price) || price <= 0) return;
                const grossAmount = roundMoney(Math.abs(shares * price));

                if (isDepositTransaction(tx)) {
                    const cat = normalizeCashCategory(tx?.category);
                    cash[cat] = roundMoney(cash[cat] + grossAmount);
                    chargedByCat[cat] = roundMoney(chargedByCat[cat] + grossAmount);
                    addDepositToPlanBuckets(planBuckets, tx, grossAmount);
                    return;
                }

                const ticker = String(tx?.ticker || '').trim();
                if (!ticker || shares === 0) return;
                if (!holdings[ticker]) {
                    holdings[ticker] = { shares: 0, cost: 0, name: getTradeDisplayName(tx), alloc: createEmptyCashAlloc(), bucketAlloc: createEmptyPlanBuckets() };
                }
                const h = holdings[ticker];
                const fee = getTransactionFee(tx);

                if (shares > 0) {
                    const tradeCost = roundMoney(grossAmount + fee);
                    totalBuyAmount = roundMoney(totalBuyAmount + tradeCost);
                    h.shares = roundShares(h.shares + shares);
                    h.cost = roundMoney(h.cost + tradeCost);
                    const bucketUse = consumePlanBuckets(planBuckets, getPlanBucketConsumeOrderForBuy(ticker), tradeCost);
                    addBucketAlloc(h.bucketAlloc, bucketUse.usedByBucket);
                    if (bucketUse.remain > 0) {
                        addToPlanBucket(h.bucketAlloc, getFallbackPlanBucketForTicker(ticker), bucketUse.remain);
                    }

                    let remain = tradeCost;
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
                const appliedFee = sellQty > 0 ? roundMoney(fee * (actualSellQty / sellQty)) : 0;
                const proceeds = roundMoney(Math.max(0, actualSellQty * price - appliedFee));
                const avgCost = h.shares > 0 ? h.cost / h.shares : 0;
                const costBasisSold = roundMoney(actualSellQty * avgCost);
                const catCostSplit = distributeAmountBySource(costBasisSold, h.alloc, ['1', '2', '3'], '1');
                const catProceedsSplit = distributeAmountBySource(proceeds, h.alloc, ['1', '2', '3'], '1');
                const bucketCostSplit = distributeAmountBySource(costBasisSold, h.bucketAlloc, PLAN_BUCKET_ORDER, getFallbackPlanBucketForTicker(ticker));
                const bucketProceedsSplit = distributeAmountBySource(proceeds, h.bucketAlloc, PLAN_BUCKET_ORDER, getFallbackPlanBucketForTicker(ticker));

                ['1', '2', '3'].forEach(cat => {
                    h.alloc[cat] = roundMoney(Number(h.alloc[cat] || 0) - Number(catCostSplit[cat] || 0));
                    cash[cat] = roundMoney(cash[cat] + Number(catProceedsSplit[cat] || 0));
                });
                PLAN_BUCKET_ORDER.forEach(key => {
                    h.bucketAlloc[key] = roundMoney(Number(h.bucketAlloc[key] || 0) - Number(bucketCostSplit[key] || 0));
                    addToPlanBucket(planBuckets, key, Number(bucketProceedsSplit[key] || 0));
                });

                h.shares = roundShares(h.shares - actualSellQty);
                h.cost = roundMoney(Math.max(0, h.cost - costBasisSold));
                if (h.shares <= 0.0001 || h.cost <= 0.0001) {
                    h.shares = Math.max(0, h.shares);
                    h.cost = Math.max(0, h.cost);
                    h.alloc = createEmptyCashAlloc();
                    h.bucketAlloc = createEmptyPlanBuckets();
                }
            });

            reconcilePlanBucketsToCash(planBuckets, cash);
            return { cash, chargedByCat, buyUsedByCat, planBuckets, holdings, totalBuyAmount };
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
            let totalDepositAmount = 0;
            const depositAmountByCategory = { "1": 0, "2": 0, "3": 0 };
            let unassignedDividendCount = 0;
            const tickerMonthlyStats = {};

            sortedTx.forEach((tx) => {
                const txMonth = getMonthKey(tx?.date);
                const shares = roundShares(tx?.shares || 0);
                const price = Number(tx?.price || 0);
                if (!Number.isFinite(price) || price <= 0) return;
                const grossAmount = roundMoney(Math.abs(shares * price));
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
                    cash[cat] = roundMoney(cash[cat] + grossAmount);
                    if (txMonth === monthKey) {
                        totalDepositAmount = roundMoney(totalDepositAmount + grossAmount);
                        depositAmountByCategory[cat] = roundMoney(depositAmountByCategory[cat] + grossAmount);
                    }
                    if (txMonth === monthKey && cat === '3') {
                        dividendIn = roundMoney(dividendIn + grossAmount);
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
                        tickerMonthlyStats[dividendTicker].dividendIn = roundMoney(tickerMonthlyStats[dividendTicker].dividendIn + grossAmount);
                    }
                    return;
                }

                if (!ticker || shares === 0) return;
                if (!holdings[ticker]) holdings[ticker] = { shares: 0, cost: 0 };
                const h = holdings[ticker];
                const tickerStat = tickerMonthlyStats[ticker];
                const fee = getTransactionFee(tx);

                if (shares > 0) {
                    const tradeCost = roundMoney(grossAmount + fee);
                    if (txMonth === monthKey) buyActionCount += 1;
                    if (txMonth === monthKey) {
                        buyShares = roundShares(buyShares + shares);
                        buyAmount = roundMoney(buyAmount + tradeCost);
                        if (tickerStat) {
                            tickerStat.buyShares = roundShares(tickerStat.buyShares + shares);
                            tickerStat.buyAmount = roundMoney(tickerStat.buyAmount + tradeCost);
                        }
                    }
                    h.shares = roundShares(h.shares + shares);
                    h.cost = roundMoney(h.cost + tradeCost);

                    let remain = tradeCost;
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
                const appliedFee = sellQty > 0 ? roundMoney(fee * (actualSellQty / sellQty)) : 0;
                const proceeds = roundMoney(Math.max(0, actualSellQty * price - appliedFee));
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

            const monthlyBase = roundMoney(buyAmount + sellCostBasis);
            const totalReturnAmount = roundMoney(realizedPnl + dividendIn);
            const monthlyTotalReturnRate = monthlyBase > 0 ? (totalReturnAmount / monthlyBase) * 100 : 0;
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
                totalDepositAmount,
                depositAmountByCategory,
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
                time: normalizeClockTime(item.time),
                ticker: String(item.ticker || ''),
                name: String(item.name || ''),
                shares: Number(item.shares || 0),
                price: Number(item.price || 0),
                fee: getTransactionFee(item),
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
            markHistoryDirty();
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
                createdAtMs: Number(payload?.keepCreatedAtMs || payload?.createdAtMs || Date.now())
            }, source);
            transactions = [
                record,
                ...transactions.filter(tx => String(tx.id) !== safeId)
            ];
            transactionsVersion += 1;
            markHistoryDirty();
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
            setSyncStatus('저장 완료 · 백그라운드 동기화 중...', 'info');
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
                let fromCache = false;
                let sawSnapshot = false;

                while (pageCount < HISTORY_FETCH_MAX_PAGES) {
                    const query = lastDoc ? nextQuery(lastDoc) : firstQuery();
                    const snap = await withTimeout(query.get(), 15000, '기록 조회');
                    if (snap) {
                        sawSnapshot = true;
                        fromCache = fromCache || Boolean(snap.metadata?.fromCache);
                    }
                    if (!snap || snap.empty) break;
                    docs.push(...snap.docs);
                    pageCount += 1;
                    lastDoc = snap.docs[snap.docs.length - 1];
                    if (snap.size < HISTORY_FETCH_PAGE_SIZE || docs.length >= maxDocs) break;
                }
                return { docs: docs.slice(0, maxDocs), fromCache, sawSnapshot };
            };

            let result = { docs: [], fromCache: false, sawSnapshot: false };
            try {
                result = await loadAllByQuery({
                    firstQuery: () => firestoreDb.collection(firebaseCollection).orderBy('date', 'desc').limit(HISTORY_FETCH_PAGE_SIZE),
                    nextQuery: (lastDoc) => firestoreDb.collection(firebaseCollection).orderBy('date', 'desc').startAfter(lastDoc).limit(HISTORY_FETCH_PAGE_SIZE)
                });
            } catch (e) {
                console.warn('Date-ordered history query failed, using documentId pagination fallback.', e);
                const docIdField = firebase?.firestore?.FieldPath?.documentId?.();
                if (!docIdField) throw e;
                result = await loadAllByQuery({
                    firstQuery: () => firestoreDb.collection(firebaseCollection).orderBy(docIdField).limit(HISTORY_FETCH_PAGE_SIZE),
                    nextQuery: (lastDoc) => firestoreDb.collection(firebaseCollection).orderBy(docIdField).startAfter(lastDoc.id).limit(HISTORY_FETCH_PAGE_SIZE)
                });
            }
            const records = result.docs.map(doc => toHistoryRecord({ id: doc.id, ...(doc.data() || {}) }, 'firebase'));
            Object.defineProperty(records, 'loadMeta', {
                value: { fromCache: result.fromCache, sawSnapshot: result.sawSnapshot },
                enumerable: false
            });
            return records;
        }

        function applyLoadedTransactions(loadedTransactions) {
            const loaded = Array.isArray(loadedTransactions) ? loadedTransactions : [];
            const meta = loadedTransactions?.loadMeta || {};
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            const untrustedEmpty = loaded.length === 0 && (Boolean(meta.fromCache) || offline || meta.sawSnapshot === false);
            if (transactions.length > 0 && untrustedEmpty) {
                return { preserved: true, count: transactions.length };
            }

            transactions = mergePendingTransactions(loaded);
            transactionsVersion += 1;
            markHistoryDirty();
            invalidateMonthlyReportCaches({ persisted: true });
            return { preserved: false, count: transactions.length };
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
            if(Number.isFinite(Number(payload.fee)) && Number(payload.fee) >= 0) doc.fee = roundMoney(payload.fee);
            if(payload.time) doc.time = String(payload.time);
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
        function isSectionVisible(id) {
            const section = getEl(`section-${id}`);
            return !!section && !section.classList.contains('hidden');
        }
        function markHistoryDirty() {
            historyNeedsRender = true;
            historyRenderSignature = '';
        }
        function renderHistoryIfVisible(options = {}) {
            if (isSectionVisible('history')) renderHistoryList('history-list', transactions, options);
            else historyNeedsRender = true;
        }
        function setFormStatus(id, message = '', type = 'info') {
            const el = getEl(id);
            if (!el) return;
            el.classList.remove('hidden', 'form-status-error', 'form-status-success', 'form-status-info');
            if (!message) {
                el.classList.add('hidden');
                el.innerText = '';
                return;
            }
            el.classList.add(type === 'error' ? 'form-status-error' : (type === 'success' ? 'form-status-success' : 'form-status-info'));
            el.innerText = message;
        }
        function setButtonBusy(button, busy, busyText, readyText) {
            if (!button) return;
            button.disabled = Boolean(busy);
            button.classList.toggle('is-busy', Boolean(busy));
            button.innerText = busy ? busyText : readyText;
        }

        function setImportStatus(message = '', type = 'info') {
            setFormStatus('import-status', message, type);
        }

        function updateImportFileSummary(files = []) {
            const list = Array.from(files || []);
            safeSetText('import-file-count', `${list.length}개`);
            safeSetText('import-file-summary', list.length ? list.map((file) => file.name).slice(0, 4).join(', ') : '대기 중');
        }

        function getImportAiCostMonthKey() {
            return new Date().toISOString().slice(0, 7);
        }

        function readImportAiCostMeter() {
            const month = getImportAiCostMonthKey();
            const fallback = { month, requests: 0, krw: 0, usd: 0 };
            try {
                const saved = JSON.parse(localStorage.getItem(IMPORT_AI_COST_METER_KEY) || 'null');
                if (!saved || saved.month !== month) return fallback;
                return {
                    month,
                    requests: Math.max(0, Number(saved.requests || 0)),
                    krw: Math.max(0, Number(saved.krw || 0)),
                    usd: Math.max(0, Number(saved.usd || 0))
                };
            } catch (e) {
                return fallback;
            }
        }

        function writeImportAiCostMeter(meter) {
            try {
                localStorage.setItem(IMPORT_AI_COST_METER_KEY, JSON.stringify(meter));
            } catch (e) {
                console.warn('Failed to save import AI cost meter.', e);
            }
        }

        function renderImportAiCostMeter() {
            const meter = readImportAiCostMeter();
            const krw = Number(meter.krw || 0);
            const requests = Number(meter.requests || 0);
            const krwLabel = Math.ceil(krw).toLocaleString();
            safeSetText('import-ai-month-summary', `이번 달 ₩${krwLabel} · ${requests}회`);

            const bar = getEl('import-ai-cost-bar');
            if (bar) {
                const softWarningKrw = 1000;
                const width = Math.min(100, Math.round((krw / softWarningKrw) * 100));
                bar.style.width = `${width}%`;
            }

            let message = '사진 분석은 OpenAI API와 Firebase Function을 사용합니다. 화면 비용은 이 기기 기준 추정치이며 실제 청구액은 콘솔에서 확인하세요.';
            if (requests >= 20 || krw >= 1000) {
                message = '이번 달 사진 분석 추정 사용량이 늘고 있습니다. 대량 업로드 전 Firebase 예산 알림과 OpenAI 사용량 대시보드를 확인하세요.';
            } else if (requests > 0) {
                message = '누적값은 이 브라우저에서 성공한 사진 분석만 더한 추정치입니다. 실제 청구액은 OpenAI/Firebase 콘솔 기준입니다.';
            }
            safeSetText('import-ai-guard-text', message);
        }

        function rememberImportAiCost(cost = null) {
            if (!cost || !Number.isFinite(Number(cost.krw))) {
                renderImportAiCostMeter();
                return;
            }
            const meter = readImportAiCostMeter();
            const next = {
                month: meter.month,
                requests: Number(meter.requests || 0) + 1,
                krw: Number(meter.krw || 0) + Math.max(0, Number(cost.krw || 0)),
                usd: Number(meter.usd || 0) + Math.max(0, Number(cost.usd || 0))
            };
            writeImportAiCostMeter(next);
            renderImportAiCostMeter();
        }

        function updateImportCostSummary(cost = null) {
            importLastCostEstimate = cost || null;
            if (!cost) {
                safeSetText('import-cost-summary', '₩0');
                safeSetText('import-token-summary', 'usage 대기 중');
                return;
            }
            const krwText = Number.isFinite(Number(cost.krw))
                ? `약 ₩${Math.ceil(Number(cost.krw)).toLocaleString()}`
                : '대시보드 확인 필요';
            const inputTokens = Number(cost.inputTokens || 0).toLocaleString();
            const outputTokens = Number(cost.outputTokens || 0).toLocaleString();
            safeSetText('import-cost-summary', krwText);
            safeSetText('import-token-summary', `${cost.model || 'model'} · input ${inputTokens} · output ${outputTokens}`);
        }

        function normalizeImportSide(raw, shares = 0, name = '') {
            const value = String(raw || '').trim().toLowerCase();
            const label = `${value} ${String(name || '').toLowerCase()}`;
            if (label.includes('매도') || label.includes('sell')) return 'sell';
            if (label.includes('매수') || label.includes('buy') || label.includes('purchase')) return 'buy';
            if (label.includes('배당') || label.includes('dividend')) return 'dividend';
            if (label.includes('입금') || label.includes('deposit') || label.includes('cash')) return 'deposit';
            if (Number(shares || 0) < 0) return 'sell';
            return '';
        }

        function parseImportNumber(value) {
            if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
            const raw = String(value ?? '').trim();
            if (!raw || raw === '-' || raw === '—') return 0;
            const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-');
            const cleaned = raw.replace(/[^\d.]/g, '');
            const n = Number(cleaned);
            if (!Number.isFinite(n)) return 0;
            return negative ? -n : n;
        }

        function parseImportDate(value) {
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
            }
            if (typeof value === 'number' && Number.isFinite(value) && value > 25000 && value < 80000) {
                const excelDate = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400 * 1000);
                if (!Number.isNaN(excelDate.getTime())) {
                    return `${excelDate.getUTCFullYear()}-${String(excelDate.getUTCMonth() + 1).padStart(2, '0')}-${String(excelDate.getUTCDate()).padStart(2, '0')}`;
                }
            }
            const raw = String(value ?? '').trim();
            if (!raw) return '';
            const compact = raw.replace(/[^\d]/g, '');
            if (compact.length === 8) {
                return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
            }
            const match = raw.match(/(\d{2,4})[./\-년\s]+(\d{1,2})[./\-월\s]+(\d{1,2})/);
            if (!match) return raw.substring(0, 10);
            const year = match[1].length === 2 ? `20${match[1]}` : match[1];
            return `${year}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
        }

        function normalizeImportLookupText(value) {
            return String(value || '')
                .toUpperCase()
                .replace(/[^0-9A-Z가-힣]/g, '');
        }

        function getImportTickerAliases(ticker, name = '') {
            const aliases = [
                ticker,
                name,
                getMarketName(ticker, ''),
                ...(IMPORT_TICKER_ALIASES[ticker] || [])
            ];
            return Array.from(new Set(
                aliases
                    .map((alias) => String(alias || '').trim())
                    .filter(Boolean)
            ));
        }

        function resolveImportTicker(rawTicker = '', rawName = '') {
            const ticker = String(rawTicker || '').trim();
            const name = String(rawName || '').trim();
            const normalizedName = normalizeImportLookupText(name);
            if (!normalizedName) return ticker;

            const aliasCandidates = Object.entries(IMPORT_TICKER_ALIASES)
                .flatMap(([aliasTicker, aliases]) => {
                    const marketName = getMarketName(aliasTicker, '');
                    return getImportTickerAliases(aliasTicker, marketName || aliasTicker)
                        .concat(aliases || [])
                        .map((alias) => ({
                            ticker: aliasTicker,
                            alias,
                            normalized: normalizeImportLookupText(alias)
                        }));
                })
                .filter((item) => item.normalized.length >= 2)
                .sort((a, b) => b.normalized.length - a.normalized.length);

            const matched = aliasCandidates.find((item) => normalizedName.includes(item.normalized));
            if (matched) return matched.ticker;

            if (ticker && marketData?.[ticker]) return ticker;
            return ticker;
        }

        function getKnownTickerList() {
            return Object.entries(marketData || {}).map(([ticker, data]) => ({
                ticker,
                name: String(data?.name || ticker),
                aliases: getImportTickerAliases(ticker, String(data?.name || ticker))
            }));
        }

        function getImportRowWarning(row) {
            const side = normalizeImportSide(row?.side, row?.shares, row?.name) || row?.side;
            const price = Number(row?.price || 0);
            const shares = Number(row?.shares || 0);
            if (!row?.date) return '날짜 확인';
            if (!Number.isFinite(price) || price <= 0) return side === 'buy' || side === 'sell' ? '단가 확인' : '금액 확인';
            if (side === 'buy' || side === 'sell') {
                if (!row?.ticker && !row?.name) return '종목 확인';
                if (!Number.isFinite(shares) || shares <= 0) return '수량 확인';
            }
            if (side === 'unknown' || !side) return '구분 확인';
            return '';
        }

        function createImportRow(raw = {}, source = '') {
            const rawShares = parseImportNumber(raw.shares);
            const side = normalizeImportSide(raw.side, rawShares, raw.name) || String(raw.side || 'unknown');
            const isCash = side === 'deposit' || side === 'dividend';
            const shares = isCash ? 1 : Math.abs(rawShares || parseImportNumber(raw.quantity));
            const amount = parseImportNumber(raw.amount);
            let price = parseImportNumber(raw.price);
            if (!price && amount > 0 && !isCash && shares > 0) price = amount / shares;
            if (!price && amount > 0 && isCash) price = amount;

            const category = isCash
                ? (side === 'dividend' ? '3' : normalizeCashCategory(raw.category || '1'))
                : '0';
            const confidence = Number(raw.confidence ?? raw.score ?? 0);
            const rawName = String(raw.name || raw.product || '').trim();
            const ticker = resolveImportTicker(String(raw.ticker || raw.code || '').trim(), rawName);
            return {
                id: createTxnId(),
                selected: true,
                source: String(raw.sourceFile || source || '').trim(),
                date: parseImportDate(raw.date),
                time: normalizeClockTime(raw.time || raw.date),
                side: ['buy', 'sell', 'deposit', 'dividend'].includes(side) ? side : 'unknown',
                ticker,
                name: rawName || getMarketName(ticker, ticker),
                shares: roundShares(shares),
                price: Math.round(Number(price || 0) * 100) / 100,
                category,
                confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
                memo: String(raw.memo || '').trim()
            };
        }

        function importRowToPayload(row) {
            const side = normalizeImportSide(row.side, row.shares, row.name) || row.side;
            const price = Number(row.price || 0);
            const shares = roundShares(row.shares || 0);
            const date = String(row.date || '').substring(0, 10);
            const time = normalizeClockTime(row.time);
            if (!date || !Number.isFinite(price) || price <= 0) return null;

            if (side === 'deposit' || side === 'dividend') {
                const ticker = side === 'dividend' ? String(row.ticker || 'DEPOSIT').trim() : 'DEPOSIT';
                const marketName = ticker && ticker !== 'DEPOSIT' ? getMarketName(ticker, row.name || ticker) : '';
                return {
                    id: String(row.id || createTxnId()),
                    date,
                    time,
                    ticker: ticker || 'DEPOSIT',
                    name: side === 'dividend'
                        ? `${marketName || row.name || '배당'} 배당 입금`
                        : '현금 입금',
                    shares: 1,
                    price,
                    category: side === 'dividend' ? '3' : normalizeCashCategory(row.category || '1')
                };
            }

            if ((side !== 'buy' && side !== 'sell') || shares <= 0 || (!row.ticker && !row.name)) return null;
            const ticker = String(row.ticker || '').trim();
            const name = String(row.name || getMarketName(ticker, ticker)).trim();
            return {
                id: String(row.id || createTxnId()),
                date,
                time,
                ticker,
                name,
                shares: side === 'sell' ? -Math.abs(shares) : Math.abs(shares),
                price,
                fee: calculateTradeFee(shares, price),
                category: 0,
                side
            };
        }

        function getTransactionBaseKey(tx) {
            if (!tx) return '';
            const date = String(tx.date || '').substring(0, 10);
            const ticker = String(tx.ticker || '').trim().toUpperCase();
            const category = normalizeTransactionCategory(tx.category);
            const side = isDepositTransaction(tx)
                ? `deposit-${normalizeCashCategory(category)}`
                : (getExplicitTradeSide(tx) || (Number(tx.shares || 0) > 0 ? 'buy' : ''));
            const shares = roundShares(tx.shares || 0).toFixed(4);
            const price = Math.round(Number(tx.price || 0) * 100);
            if (!date || !ticker || !side || !Number.isFinite(price)) return '';
            return [date, ticker, side, category, shares, price].join('|');
        }

        function getTransactionDuplicateKey(tx) {
            const base = getTransactionBaseKey(tx);
            if (!base) return '';
            // 시각까지 넣어 같은 날 동일 종목·수량·단가의 '진짜 다른 거래'를 구분한다.
            return `${normalizeClockTime(tx?.time)}|${base}`;
        }

        // 두 거래가 '같은 실거래'인지 판정. 한쪽에 시각이 없으면(예: 시각 기능 이전에 저장된 옛 기록)
        // 시각을 무시하고 나머지로 비교해 재업로드 시 이중 등록을 막는다.
        function transactionIdentityMatches(a, b) {
            const base = getTransactionBaseKey(a);
            if (!base || base !== getTransactionBaseKey(b)) return false;
            const ta = normalizeClockTime(a?.time);
            const tb = normalizeClockTime(b?.time);
            if (ta && tb) return ta === tb;
            return true;
        }

        function getDuplicateImportIndexes(rows = importRows) {
            const duplicates = new Set();
            const batchExactKeys = new Set();
            (rows || []).forEach((row, index) => {
                const payload = importRowToPayload(row);
                if (!getTransactionBaseKey(payload)) return;
                // 이미 저장된 기록과 비교: 시각 없는 옛 기록도 잡도록 관대하게(시각 무시 허용).
                const matchesExisting = transactions.some((tx) => transactionIdentityMatches(payload, tx));
                // 같은 배치 안에서는 엄격하게(시각 포함): 진짜 다른 거래는 살린다.
                const exactKey = getTransactionDuplicateKey(payload);
                const matchesBatch = batchExactKeys.has(exactKey);
                if (matchesExisting || matchesBatch) {
                    duplicates.add(index);
                } else {
                    batchExactKeys.add(exactKey);
                }
            });
            return duplicates;
        }

        function isLikelyExistingTransaction(row, index = importRows.indexOf(row), rows = importRows) {
            if (index < 0) {
                const payload = importRowToPayload(row);
                return Boolean(getTransactionBaseKey(payload))
                    && transactions.some((tx) => transactionIdentityMatches(payload, tx));
            }
            return getDuplicateImportIndexes(rows).has(index);
        }

        function renderImportRows() {
            const empty = getEl('import-preview-empty');
            const wrap = getEl('import-review-wrap');
            const body = getEl('import-review-body');
            if (!empty || !wrap || !body) return;

            empty.classList.toggle('hidden', importRows.length > 0);
            wrap.classList.toggle('hidden', importRows.length === 0);
            if (!importRows.length) {
                body.innerHTML = '';
                return;
            }

            const duplicateIndexes = getDuplicateImportIndexes(importRows);
            body.innerHTML = importRows.map((row, index) => {
                const warning = getImportRowWarning(row);
                const duplicate = duplicateIndexes.has(index);
                const rowClass = [
                    warning ? 'import-row-warning' : '',
                    duplicate ? 'import-row-duplicate' : ''
                ].filter(Boolean).join(' ');
                const rowNote = duplicate
                    ? '이미 저장된 거래입니다. 저장에서 제외됩니다.'
                    : (warning || row.memo || '');
                const confidencePct = Math.round(Number(row.confidence || 0) * 100);
                const sideOptions = [
                    ['buy', '매수'],
                    ['sell', '매도'],
                    ['deposit', '입금'],
                    ['dividend', '배당'],
                    ['unknown', '확인']
                ].map(([value, label]) => `<option value="${value}" ${row.side === value ? 'selected' : ''}>${label}</option>`).join('');
                const categoryOptions = [
                    ['0', '거래'],
                    ['1', '원금'],
                    ['2', '특별'],
                    ['3', '배당']
                ].map(([value, label]) => `<option value="${value}" ${String(row.category) === value ? 'selected' : ''}>${label}</option>`).join('');

                return `
                    <tr class="${rowClass}" title="${escapeHtml(row.source || '')}">
                        <td class="import-col-check"><input type="checkbox" data-import-index="${index}" data-import-field="selected" ${row.selected ? 'checked' : ''} ${duplicate ? 'disabled' : ''}></td>
                        <td class="import-col-date"><input type="date" value="${escapeHtml(row.date)}" data-import-index="${index}" data-import-field="date"></td>
                        <td class="import-col-side"><select data-import-index="${index}" data-import-field="side">${sideOptions}</select></td>
                        <td class="import-col-ticker"><input type="text" value="${escapeHtml(row.ticker)}" data-import-index="${index}" data-import-field="ticker"></td>
                        <td class="import-col-name"><input type="text" value="${escapeHtml(row.name)}" data-import-index="${index}" data-import-field="name"></td>
                        <td class="import-col-number"><input type="number" step="0.0001" value="${escapeHtml(row.shares)}" data-import-index="${index}" data-import-field="shares"></td>
                        <td class="import-col-number"><input type="number" step="0.01" value="${escapeHtml(row.price)}" data-import-index="${index}" data-import-field="price"></td>
                        <td class="import-col-category"><select data-import-index="${index}" data-import-field="category">${categoryOptions}</select></td>
                        <td class="import-col-confidence">
                            <span class="import-confidence-pill">${confidencePct || 0}%</span>
                            ${duplicate ? '<span class="import-duplicate-pill">중복</span>' : ''}
                            ${rowNote ? `<p class="mt-1 text-[9px] font-black ${duplicate ? 'text-rose-600' : 'text-amber-600'}">${escapeHtml(rowNote)}</p>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function updateImportRowFromField(target) {
            const index = Number(target?.dataset?.importIndex);
            const field = String(target?.dataset?.importField || '');
            const row = importRows[index];
            if (!row || !field) return;

            if (field === 'selected') {
                row.selected = Boolean(target.checked) && !isLikelyExistingTransaction(row);
                if (target.checked && !row.selected) {
                    row.memo = '이미 저장된 거래입니다. 저장에서 제외됩니다.';
                    renderImportRows();
                    setImportStatus('이미 저장된 거래는 다시 선택할 수 없습니다.', 'info');
                }
            }
            else if (field === 'shares' || field === 'price') row[field] = parseImportNumber(target.value);
            else row[field] = target.value;

            if (field === 'side') {
                if (row.side === 'dividend') row.category = '3';
                else if (row.side === 'deposit') row.category = normalizeCashCategory(row.category || '1');
                else if (row.side === 'buy' || row.side === 'sell') row.category = '0';
                renderImportRows();
            }
        }

        // 여러 번 나눠 호출한 OCR 비용 추정치를 하나로 합산한다.
        function mergeCostEstimates(list) {
            const items = (list || []).filter(Boolean);
            if (!items.length) return null;
            if (items.length === 1) return items[0];
            const sum = (key) => items.reduce((acc, c) => acc + (Number(c?.[key]) || 0), 0);
            const first = items[0] || {};
            return {
                available: items.some((c) => c?.available),
                model: first.model,
                inputTokens: sum('inputTokens'),
                cachedTokens: sum('cachedTokens'),
                outputTokens: sum('outputTokens'),
                usd: Number(sum('usd').toFixed(8)),
                krw: Number(sum('krw').toFixed(2)),
                usdKrwRate: first.usdKrwRate,
                note: first.note
            };
        }

        // 이름이 비슷한 KODEX 미국나스닥100(379810)과 미국나스닥100 타겟데일리커버드콜(486290)을
        // 단가 군집으로 교정한다. 둘 다 있고 중앙값이 30% 넘게 벌어질 때만 동작(오작동 방지).
        function disambiguateNasdaqPair(trades) {
            const CANON = { '379810': 'KODEX 미국나스닥100', '486290': 'TIGER 미국나스닥100 타겟데일리커버드콜' };
            const medianFor = (ticker) => {
                const ps = trades
                    .filter((t) => resolveImportTicker(String(t.ticker || '').trim(), String(t.name || '').trim()) === ticker)
                    .map((t) => Number(t.price))
                    .filter((p) => p > 0)
                    .sort((a, b) => a - b);
                return ps.length ? ps[Math.floor(ps.length / 2)] : null;
            };
            const mA = medianFor('379810');
            const mB = medianFor('486290');
            if (mA == null || mB == null) return trades;
            if (Math.abs(mA - mB) < Math.max(mA, mB) * 0.3) return trades;
            return trades.map((t) => {
                const cur = resolveImportTicker(String(t.ticker || '').trim(), String(t.name || '').trim());
                if (cur !== '379810' && cur !== '486290') return t;
                const p = Number(t.price);
                const near = Math.abs(p - mA) <= Math.abs(p - mB) ? '379810' : '486290';
                return near === cur ? t : { ...t, ticker: near, name: CANON[near] };
            });
        }

        // OCR 원본 행을 합친다: 매매는 주문내역(docType 'order', 가격 있음)을 정식 거래로 삼고,
        // 계좌내역 체결줄(docType 'ledger', 시각만)에서 (종목+수량+구분)이 같은 걸 찾아 실제 날짜·시각을 붙인다.
        // 계좌내역 체결줄 자체는 거래로 만들지 않아 가격 0짜리 중복을 원천 차단한다. 입금·배당은 그대로 통과.
        function reconcileExtractedRows(rawItems = []) {
            const items = (rawItems || []).map((r) => ({ ...r }));
            const tradeSideOf = (r) => normalizeImportSide(r.side, r.shares, r.name);
            const isTradeRow = (r) => {
                const s = tradeSideOf(r);
                return s === 'buy' || s === 'sell';
            };
            const tradeKey = (r) => {
                const resolved = resolveImportTicker(String(r.ticker || '').trim(), String(r.name || '').trim());
                const idPart = resolved || normalizeImportLookupText(r.name);
                return `${idPart}|${Math.abs(roundShares(r.shares || 0))}|${tradeSideOf(r)}`;
            };

            const orderTrades = [];
            const ledgerTradeLegs = [];
            const passthrough = [];
            items.forEach((r) => {
                if (!isTradeRow(r)) {
                    passthrough.push(r); // 입금·배당 등은 그대로
                    return;
                }
                const docType = String(r.docType || '').toLowerCase();
                const hasPrice = Number(r.price || 0) > 0;
                // 주문내역(가격 있음) = 정식 거래 / 계좌내역 체결줄(시각만, 가격 0) = 시각 공급용
                if (docType === 'ledger' || (docType !== 'order' && !hasPrice)) {
                    ledgerTradeLegs.push(r);
                } else {
                    orderTrades.push(r);
                }
            });

            // 거래는 주문내역(주문일 + 가격)만 사용한다. 카카오는 매매 '체결 시각'을 노출하지 않고,
            // 계좌내역 입고는 결제일(T+2)이라 날짜가 달라 기존 주문일 기록과 중복 판정이 어긋난다.
            // → 계좌내역 체결줄은 날짜/시각으로 쓰지 않고 버린다. 같은 날 입금↔매매 순서는 '입금 우선'으로 처리.
            // 정제: 매매는 가격이 있는 것만, 현금은 모델이 deposit/dividend로 명확히 판정한 것만 남겨
            // 국내주식구매/판매 현금 정산줄이 side 'unknown' 등으로 새어들어 가짜 입출금을 만드는 것을 차단한다.
            const orderKeys = new Set(orderTrades.map(tradeKey));
            const pricedTrades = orderTrades.filter((r) => Number(r.price || 0) > 0);
            // 현금 정산줄(국내주식구매/판매)이 매매로 잘못 분류되면 '단가' 자리에 총액(주당가×주수)이
            // 들어와 비정상적으로 커진다. 같은 종목 최저 단가의 5배를 넘는 건 정산줄로 보고 버린다
            // (같은 ETF의 주당가는 그 정도로 벌어지지 않는다).
            const minPriceByTicker = {};
            pricedTrades.forEach((r) => {
                const t = resolveImportTicker(String(r.ticker || '').trim(), String(r.name || '').trim());
                const p = Number(r.price);
                if (!(t in minPriceByTicker) || p < minPriceByTicker[t]) minPriceByTicker[t] = p;
            });
            const sanePricedTrades = pricedTrades.filter((r) => {
                const t = resolveImportTicker(String(r.ticker || '').trim(), String(r.name || '').trim());
                return Number(r.price) <= (minPriceByTicker[t] || 0) * 5 + 1;
            });
            // 이름이 거의 같은 'KODEX 미국나스닥100'(379810)과 '미국나스닥100 타겟데일리커버드콜'(486290)은
            // 모델이 가끔 뒤바꾼다. 두 종목이 함께 들어오고 단가 군집이 뚜렷이 갈리면 가까운 쪽으로 자가 교정한다.
            const cleanTrades = disambiguateNasdaqPair(sanePricedTrades).map((r) => ({ ...r, time: '' }));
            const cleanCash = passthrough.filter((r) => {
                const s = normalizeImportSide(r.side, r.shares, r.name);
                return (s === 'deposit' || s === 'dividend') && Number(r.price || 0) > 0;
            });

            const warnings = [];
            const noise = (orderTrades.length - cleanTrades.length) + (passthrough.length - cleanCash.length);
            if (noise) {
                warnings.push(`가격·구분이 불명확한 ${noise}개 행은 제외했습니다(현금 정산줄 등).`);
            }
            const orphanLegs = ledgerTradeLegs.filter((r) => !orderKeys.has(tradeKey(r))).length;
            if (orphanLegs) {
                warnings.push(`주문내역 가격이 없는 체결 ${orphanLegs}건은 제외했습니다. 해당 주문내역도 함께 캡처하면 반영됩니다.`);
            }
            return { rows: [...cleanTrades, ...cleanCash], warnings };
        }

        function addImportRows(rows = [], source = '') {
            const nextRows = rows.map((item) => createImportRow(item, source)).filter((row) => {
                return row.date || row.ticker || row.name || Number(row.price || 0) > 0;
            });
            const startIndex = importRows.length;
            importRows = [...importRows, ...nextRows];
            const duplicateIndexes = getDuplicateImportIndexes(importRows);
            nextRows.forEach((row, offset) => {
                if (duplicateIndexes.has(startIndex + offset)) {
                    row.selected = false;
                    row.memo = row.memo || '이미 저장된 거래와 유사합니다.';
                }
            });
            renderImportRows();
            setImportStatus(nextRows.length ? `${nextRows.length}개 후보를 불러왔습니다.` : '가져올 거래 후보가 없습니다.', nextRows.length ? 'success' : 'error');
        }

        window.openImportImagePicker = () => getEl('import-image-input')?.click();
        window.openImportDataPicker = () => getEl('import-data-input')?.click();
        renderImportAiCostMeter();
        window.toggleAllImportRows = (selected) => {
            importRows = importRows.map((row) => ({
                ...row,
                selected: Boolean(selected) && !isLikelyExistingTransaction(row),
                memo: isLikelyExistingTransaction(row)
                    ? (row.memo || '이미 저장된 거래입니다. 저장에서 제외됩니다.')
                    : row.memo
            }));
            renderImportRows();
        };
        window.clearImportRows = () => {
            importRows = [];
            updateImportCostSummary(null);
            updateImportFileSummary([]);
            renderImportRows();
            setImportStatus();
        };

        function readFileAsDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
                reader.readAsDataURL(file);
            });
        }

        function readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
                reader.readAsText(file, 'utf-8');
            });
        }

        function readFileAsArrayBuffer(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
                reader.readAsArrayBuffer(file);
            });
        }

        function resizeImageDataUrl(dataUrl, maxSide = 1800, quality = 0.9) {
            return new Promise((resolve) => {
                const image = new Image();
                image.onload = () => {
                    const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
                    const width = Math.max(1, Math.round((image.width || 1) * scale));
                    const height = Math.max(1, Math.round((image.height || 1) * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                image.onerror = () => resolve(dataUrl);
                image.src = dataUrl;
            });
        }

        window.handleImportImages = async (fileList) => {
            const files = Array.from(fileList || []).filter((file) => /^image\//i.test(file.type || ''));
            updateImportFileSummary(files);
            if (!files.length) {
                setImportStatus('이미지 파일을 찾지 못했습니다.', 'error');
                return;
            }
            if (!TRADE_EXTRACT_URL) {
                setImportStatus('추출 API URL이 설정되지 않았습니다.', 'error');
                return;
            }
            if (files.length > 8) {
                setImportStatus('사진은 한 번에 최대 8장까지 처리합니다.', 'error');
                return;
            }

            setImportStatus('사진 분석 중입니다...', 'info');
            try {
                const images = [];
                for (const file of files) {
                    const dataUrl = await readFileAsDataUrl(file);
                    images.push({
                        name: file.name,
                        dataUrl: await resizeImageDataUrl(dataUrl)
                    });
                }
                const knownTickers = getKnownTickerList();
                const callExtract = async (imgs) => {
                    const response = await fetchWithTimeout(TRADE_EXTRACT_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ images: imgs, knownTickers })
                    }, 90000);
                    const payload = await response.json();
                    if (!response.ok || !payload?.ok) {
                        throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
                    }
                    return payload;
                };
                // 사진을 2장씩 묶어 개별 호출한다. 한 번에 여러 장을 보내면 모델이 행을 누락하거나
                // 비슷한 종목명(KODEX vs 커버드콜)을 헷갈리기 쉬워서, 나눠서 각 사진에 집중시킨다.
                const CHUNK = 2;
                const batches = [];
                for (let i = 0; i < images.length; i += CHUNK) batches.push(images.slice(i, i + CHUNK));
                const settled = await Promise.allSettled(batches.map(callExtract));
                const okPayloads = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
                const failedCount = settled.length - okPayloads.length;
                if (!okPayloads.length) {
                    throw new Error(settled.find((s) => s.status === 'rejected')?.reason?.message || '분석 실패');
                }
                const mergedCost = mergeCostEstimates(okPayloads.map((p) => p.costEstimate).filter(Boolean));
                updateImportCostSummary(mergedCost);
                rememberImportAiCost(mergedCost);
                const rawRows = okPayloads.flatMap((p) => Array.isArray(p.items) ? p.items : []);
                const serverWarnings = okPayloads.flatMap((p) => Array.isArray(p.warnings) ? p.warnings : []);
                const reconciled = reconcileExtractedRows(rawRows);
                addImportRows(reconciled.rows, files.map((file) => file.name).join(', '));
                const allWarnings = [
                    ...serverWarnings,
                    ...reconciled.warnings,
                    ...(failedCount ? [`사진 ${failedCount}묶음 분석 실패 — 일부 누락됐을 수 있어요.`] : [])
                ];
                if (allWarnings.length) {
                    setImportStatus(`후보 ${reconciled.rows.length}개 · 확인 필요 ${allWarnings.length}건`, 'info');
                }
            } catch (error) {
                console.error(error);
                setImportStatus('사진 분석 실패: ' + (error?.message || '네트워크 오류'), 'error');
            }
        };

        function splitDelimitedLine(line, delimiter) {
            const cells = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i += 1) {
                const char = line[i];
                const next = line[i + 1];
                if (char === '"' && inQuotes && next === '"') {
                    current += '"';
                    i += 1;
                    continue;
                }
                if (char === '"') {
                    inQuotes = !inQuotes;
                    continue;
                }
                if (char === delimiter && !inQuotes) {
                    cells.push(current.trim());
                    current = '';
                    continue;
                }
                current += char;
            }
            cells.push(current.trim());
            return cells;
        }

        function parseDelimitedText(text) {
            const lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim());
            const sample = lines.slice(0, 5).join('\n');
            const delimiter = ['\t', ',', ';'].sort((a, b) => sample.split(b).length - sample.split(a).length)[0] || ',';
            return lines.map((line) => splitDelimitedLine(line, delimiter));
        }

        function normalizeHeader(value) {
            return String(value || '').replace(/\s+/g, '').replace(/[()]/g, '').toLowerCase();
        }

        function findHeaderIndex(headers, aliases) {
            const normalized = headers.map(normalizeHeader);
            return normalized.findIndex((header) => aliases.some((alias) => header.includes(normalizeHeader(alias))));
        }

        function getCell(row, index) {
            return index >= 0 ? row[index] : '';
        }

        function mapTableRowsToImportRows(tableRows, source) {
            const rows = (tableRows || []).filter((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim()));
            if (!rows.length) return [];

            let headerRowIndex = 0;
            let bestScore = -1;
            rows.slice(0, 12).forEach((row, index) => {
                const headers = row.map(String);
                const score = [
                    findHeaderIndex(headers, ['날짜', '거래일', '매매일', '체결일', '일자', 'date']),
                    findHeaderIndex(headers, ['종목명', '상품명', 'name', '상품']),
                    findHeaderIndex(headers, ['수량', '체결수량', 'quantity', 'qty', 'shares']),
                    findHeaderIndex(headers, ['단가', '체결단가', 'price', '매매단가']),
                    findHeaderIndex(headers, ['금액', '체결금액', '거래금액', 'amount', '입금액', '배당금'])
                ].filter((value) => value >= 0).length;
                if (score > bestScore) {
                    bestScore = score;
                    headerRowIndex = index;
                }
            });

            const headers = rows[headerRowIndex].map(String);
            const indexes = {
                date: findHeaderIndex(headers, ['날짜', '거래일', '매매일', '체결일', '일자', 'date']),
                time: findHeaderIndex(headers, ['시간', '시각', '체결시각', '체결시간', '거래시각', 'time']),
                ticker: findHeaderIndex(headers, ['종목코드', '단축코드', '코드', 'ticker', 'code']),
                name: findHeaderIndex(headers, ['종목명', '상품명', 'name', '상품']),
                side: findHeaderIndex(headers, ['거래구분', '매매구분', '구분', '종류', 'side', 'type', '내용']),
                shares: findHeaderIndex(headers, ['수량', '체결수량', '매매수량', 'quantity', 'qty', 'shares']),
                price: findHeaderIndex(headers, ['단가', '체결단가', '매매단가', '평균단가', 'price']),
                amount: findHeaderIndex(headers, ['금액', '체결금액', '거래금액', '입금액', '배당금', '정산금액', 'amount']),
                category: findHeaderIndex(headers, ['자금', '분류', 'category'])
            };

            return rows.slice(headerRowIndex + 1).map((row) => {
                const sideRaw = getCell(row, indexes.side);
                const name = getCell(row, indexes.name);
                const shares = parseImportNumber(getCell(row, indexes.shares));
                const side = normalizeImportSide(sideRaw, shares, name);
                const amount = parseImportNumber(getCell(row, indexes.amount));
                let price = parseImportNumber(getCell(row, indexes.price));
                if (!price && amount > 0 && shares > 0 && (side === 'buy' || side === 'sell')) price = amount / Math.abs(shares);
                if (!price && amount > 0 && (side === 'deposit' || side === 'dividend')) price = amount;
                return {
                    sourceFile: source,
                    date: getCell(row, indexes.date),
                    time: getCell(row, indexes.time),
                    ticker: getCell(row, indexes.ticker),
                    name,
                    side: side || sideRaw,
                    shares,
                    price,
                    amount,
                    category: getCell(row, indexes.category),
                    confidence: 1,
                    memo: ''
                };
            });
        }

        function ensureXlsxLibrary() {
            if (window.XLSX) return Promise.resolve(window.XLSX);
            if (xlsxLoaderPromise) return xlsxLoaderPromise;
            xlsxLoaderPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
                script.async = true;
                script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('Excel parser initialization failed.'));
                script.onerror = () => reject(new Error('Excel parser를 불러오지 못했습니다. 네트워크 연결을 확인해주세요.'));
                document.head.appendChild(script);
            }).catch((error) => {
                xlsxLoaderPromise = null;
                throw error;
            });
            return xlsxLoaderPromise;
        }

        async function parseSpreadsheetFile(file) {
            const isWorkbook = /\.(xlsx|xls)$/i.test(file.name || '');
            if (!isWorkbook) {
                const text = await readFileAsText(file);
                return parseDelimitedText(text);
            }
            await ensureXlsxLibrary();
            const buffer = await readFileAsArrayBuffer(file);
            const workbook = window.XLSX.read(buffer, { type: 'array', cellDates: true });
            const firstSheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[firstSheetName];
            return window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
        }

        window.handleImportDataFiles = async (fileList) => {
            const files = Array.from(fileList || []);
            updateImportFileSummary(files);
            if (!files.length) {
                setImportStatus('파일을 찾지 못했습니다.', 'error');
                return;
            }
            setImportStatus('파일 분석 중입니다...', 'info');
            try {
                let rows = [];
                for (const file of files) {
                    const table = await parseSpreadsheetFile(file);
                    rows = rows.concat(mapTableRowsToImportRows(table, file.name));
                }
                updateImportCostSummary(null);
                addImportRows(rows, files.map((file) => file.name).join(', '));
            } catch (error) {
                console.error(error);
                setImportStatus('파일 분석 실패: ' + (error?.message || '파일 형식 확인 필요'), 'error');
            }
        };

        window.saveSelectedImportRows = async () => {
            const selectedRows = importRows.filter((row) => row.selected);
            const selectedDuplicateIndexes = getDuplicateImportIndexes(selectedRows);
            const duplicateRows = selectedRows.filter((row, index) => selectedDuplicateIndexes.has(index));
            duplicateRows.forEach((row) => {
                row.selected = false;
                row.memo = row.memo || '이미 저장된 거래입니다. 저장에서 제외됩니다.';
            });
            const selected = selectedRows.filter((row, index) => !selectedDuplicateIndexes.has(index));
            if (!selected.length) {
                setImportStatus(
                    duplicateRows.length ? '선택한 항목이 모두 중복이라 저장하지 않았습니다.' : '저장할 행을 선택해주세요.',
                    'error'
                );
                renderImportRows();
                return;
            }
            const invalid = selected.filter((row) => !importRowToPayload(row));
            if (invalid.length) {
                setImportStatus(`확인이 필요한 행 ${invalid.length}개가 있습니다.`, 'error');
                renderImportRows();
                return;
            }

            const createdAtBase = Date.now();
            const entries = selected.map((row, index) => ({
                row,
                payload: {
                    ...importRowToPayload(row),
                    createdAtMs: createdAtBase + index
                }
            }));
            const oversell = findCandidateOversell(entries.map((entry) => entry.payload));
            if (oversell) {
                const failedEntry = entries.find((entry) => String(entry.payload.id) === String(oversell.tx.id));
                if (failedEntry) failedEntry.row.memo = `해당 시점 보유 ${oversell.availableShares.toLocaleString()}주 초과 매도`;
                setImportStatus(`${oversell.ticker} 매도 수량이 해당 시점 보유 수량(${oversell.availableShares.toLocaleString()}주)을 초과합니다.`, 'error');
                renderImportRows();
                return;
            }

            const totalAmount = selected.reduce((sum, row) => sum + Math.abs(Number(row.shares || 1) * Number(row.price || 0)), 0);
            const confirmRows = [
                { label: '저장 건수', value: `${selected.length}건` },
                { label: '합산 금액', value: `₩${Math.round(totalAmount).toLocaleString()}` },
                { label: 'API 비용', value: importLastCostEstimate?.krw ? `약 ₩${Math.ceil(importLastCostEstimate.krw).toLocaleString()}` : '-' }
            ];
            if (duplicateRows.length) {
                confirmRows.push({ label: '중복 제외', value: `${duplicateRows.length}건` });
            }
            const confirmOk = await requestRecordConfirmation({
                kind: 'import',
                title: '가져오기 저장 확인',
                subtitle: `${selected.length}개 거래 후보`,
                icon: '✓',
                tone: 'purple',
                confirmLabel: '선택 저장',
                rows: confirmRows
            });
            if (!confirmOk) return;

            const btn = getEl('import-save-btn');
            setButtonBusy(btn, true, '저장 중...', '선택 저장');
            setImportStatus('선택한 거래를 저장 중입니다...', 'info');
            let saved = 0;
            const failed = [];
            const sortedEntries = getSortedTransactions(entries.map((entry) => entry.payload))
                .map((payload) => entries.find((entry) => String(entry.payload.id) === String(payload.id)))
                .filter(Boolean);
            for (const { row, payload } of sortedEntries) {
                try {
                    const rowOversell = Number(payload.shares || 0) < 0 ? findCandidateOversell([payload]) : null;
                    if (rowOversell) {
                        throw new Error(`해당 시점 보유 ${rowOversell.availableShares.toLocaleString()}주 초과 매도`);
                    }
                    const savedId = await postMutation('add', payload);
                    await syncAfterAdd(payload, savedId);
                    row.saved = true;
                    row.selected = false;
                    saved += 1;
                } catch (error) {
                    console.error(error);
                    failed.push(row);
                    row.memo = error?.message || '저장 실패';
                }
            }
            importRows = importRows.filter((row) => !row.saved);
            renderImportRows();
            setButtonBusy(btn, false, '선택 저장', '선택 저장');
            const successMessage = duplicateRows.length
                ? `${saved}개 저장 완료 · 중복 ${duplicateRows.length}개 제외`
                : `${saved}개 저장 완료`;
            setImportStatus(
                failed.length ? `${saved}개 저장, ${failed.length}개 실패` : successMessage,
                failed.length ? 'error' : 'success'
            );
            if (saved > 0) showSection('history');
        };

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
        function formatSyncTimestamp(value) {
            const date = value ? new Date(value) : null;
            if (!date || Number.isNaN(date.getTime())) return '';
            return date.toLocaleString();
        }
        function getPriceSyncDetail() {
            const status = String(priceDataMeta?.status || '').trim();
            const updatedAt = formatSyncTimestamp(priceDataMeta?.updatedAt);
            if (!status && !updatedAt) return '가격 상태 대기 중';
            const freshness = priceDataMeta?.stale ? '마지막 정상 가격 사용' : '가격 최신 상태';
            return `${freshness}${updatedAt ? ` · 가격 갱신 ${updatedAt}` : ''}${status ? ` · ${status}` : ''}`;
        }
        function setSyncStatus(text, tone = 'info', detail = '') {
            syncStatusText = text;
            syncStatusTone = tone;
            syncStatusDetail = detail || getPriceSyncDetail();
            ['sync-time', 'sync-time-mini'].forEach((id) => {
                const el = getEl(id);
                if (!el) return;
                el.classList.remove('sync-ok', 'sync-warn', 'sync-error', 'sync-info');
                el.classList.add(`sync-${tone}`);
                el.innerText = syncStatusText;
            });
            safeSetText('sync-detail', syncStatusDetail);
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
            setSyncStatus(text, 'error', meta.reason);
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
            const safeName = escapeHtml(name);
            const safeTicker = escapeHtml(ticker);
            const stockVisual = getStockVisual(name, ticker, avatarColor);
            const avatarInitial = escapeHtml(stockVisual.label);
            const signedRate = `${profit >= 0 ? '+' : '-'}${Math.abs(prate).toFixed(1)}%`;
            const signedProfit = `${profit >= 0 ? '+' : '-'}₩${Math.round(Math.abs(profit)).toLocaleString()}`;
            const progressWidth = Math.max(8, Math.min(100, (Number(value || 0) / 1700000) * 100));
            const profitClass = profit >= 0 ? 'holding-profit-up' : 'holding-profit-down';

            return `<div class="holding-item ${trendToneClass}" data-ticker="${safeTicker}" role="button" tabindex="0" aria-label="${safeName} 상세 보기" style="--holding-color:${stockVisual.bgColor};--holding-progress:${progressWidth}%"><div class="holding-row"><div class="holding-left"><div class="holding-avatar">${avatarInitial}</div><div class="holding-copy"><p class="holding-name">${safeName}</p><p class="holding-meta">${safeTicker} · 연 ${yieldPct.toFixed(2)}%</p></div></div><div class="holding-right"><p class="holding-value">₩${Math.round(value).toLocaleString()}</p><p class="holding-return ${profitClass}">${signedProfit} (${signedRate})</p></div><span class="holding-chevron">›</span></div><div class="holding-subrow"><span>${shares.toFixed(0)}주 · 평가손익</span><span>평균 ₩${Math.round(avgPrice).toLocaleString()}</span></div><div class="holding-progress"><i></i></div></div>`;
        }

        function getCurrentSharesForTicker(ticker) {
            const key = String(ticker || '').trim();
            if (!key) return 0;
            const editId = String(getEl('edit-id')?.value || '').trim();
            const state = editId
                ? simulatePortfolioState(transactions.filter((tx) => String(tx.id) !== editId))
                : getPortfolioState();
            return Number(state?.holdings?.[key]?.shares || 0);
        }

        function getOversellShortfalls(inputTransactions = []) {
            const sharesByTicker = {};
            const shortfallsById = new Map();
            for (const tx of getSortedTransactions(inputTransactions)) {
                if (isDepositTransaction(tx)) continue;
                const ticker = String(tx?.ticker || '').trim();
                const shares = roundShares(tx?.shares || 0);
                if (!ticker || !shares) continue;
                const currentShares = roundShares(sharesByTicker[ticker] || 0);
                if (shares > 0) {
                    sharesByTicker[ticker] = roundShares(currentShares + shares);
                    continue;
                }
                const requestedShares = Math.abs(shares);
                const shortfall = Math.max(0, requestedShares - currentShares);
                const id = String(tx.id || '');
                if (id && shortfall > 0) shortfallsById.set(id, shortfall);
                sharesByTicker[ticker] = roundShares(Math.max(0, currentShares - requestedShares));
            }
            return shortfallsById;
        }

        function findCandidateOversell(candidatePayloads = [], options = {}) {
            const candidates = (candidatePayloads || []).filter(Boolean);
            if (!candidates.length) return null;
            const excludedIds = new Set((options.excludeIds || []).map((id) => String(id || '')).filter(Boolean));
            const sourceTransactions = options.baseTransactions || transactions;
            const baseTransactions = sourceTransactions.filter((tx) => !excludedIds.has(String(tx.id || '')));
            const candidateIds = new Set(candidates.map((tx) => String(tx.id || '')).filter(Boolean));
            const impactedTickers = new Set(candidates.map((tx) => String(tx?.ticker || '').trim()).filter(Boolean));
            sourceTransactions.forEach((tx) => {
                if (excludedIds.has(String(tx.id || ''))) {
                    const ticker = String(tx?.ticker || '').trim();
                    if (ticker) impactedTickers.add(ticker);
                }
            });
            const baselineShortfalls = getOversellShortfalls(sourceTransactions);
            const sharesByTicker = {};

            for (const tx of getSortedTransactions([...baseTransactions, ...candidates])) {
                if (isDepositTransaction(tx)) continue;
                const ticker = String(tx?.ticker || '').trim();
                const shares = roundShares(tx?.shares || 0);
                if (!ticker || !shares) continue;
                const currentShares = roundShares(sharesByTicker[ticker] || 0);
                if (shares > 0) {
                    sharesByTicker[ticker] = roundShares(currentShares + shares);
                    continue;
                }

                const requestedShares = Math.abs(shares);
                if (requestedShares > currentShares + 0.0001) {
                    const shortfall = requestedShares - currentShares;
                    const baselineShortfall = Number(baselineShortfalls.get(String(tx.id || '')) || 0);
                    const isCandidate = candidateIds.has(String(tx.id || ''));
                    const worsenedAffectedTrade = impactedTickers.has(ticker) && shortfall > baselineShortfall + 0.0001;
                    if (isCandidate || worsenedAffectedTrade) {
                        return { tx, ticker, requestedShares, availableShares: Math.max(0, currentShares) };
                    }
                }
                sharesByTicker[ticker] = roundShares(Math.max(0, currentShares - requestedShares));
            }
            return null;
        }

        function updateTradeSummary() {
            const shares = Number(getEl('input-shares')?.value || 0);
            const price = Number(getEl('input-price')?.value || 0);
            const ticker = String(getEl('input-ticker')?.value || selectedTicker || '').trim();
            const amount = Math.max(0, shares * price);
            const fee = calculateTradeFee(shares, price);
            const isSell = currentTransactionMode === 'sell';
            const currentShares = getCurrentSharesForTicker(ticker);
            const postShares = isSell ? Math.max(0, currentShares - shares) : currentShares + shares;
            const editId = String(getEl('edit-id')?.value || '').trim();
            const previewState = editId
                ? simulatePortfolioState(transactions.filter((tx) => String(tx.id) !== editId))
                : getPortfolioState();
            const cash = Object.values(previewState?.cash || {}).reduce((sum, value) => sum + Number(value || 0), 0);
            const afterCash = isSell ? cash + amount - fee : cash - amount - fee;
            const settledAmount = isSell ? Math.max(0, amount - fee) : amount + fee;

            safeSetText('trade-estimated-amount', `₩${Math.round(settledAmount).toLocaleString()}`);
            safeSetText('trade-post-shares', `${Number(postShares || 0).toLocaleString()}주`);
            safeSetText('trade-fee', `₩${fee.toLocaleString()}`);
            safeSetText('trade-cash-impact', `₩${Math.round(afterCash).toLocaleString()}`);
            safeSetText('trade-summary-main-label', isSell ? '예상 입금' : '예상 금액');
            safeSetText('trade-summary-side-label', isSell ? '매도 후 보유' : '매수 후 보유');
            safeSetText('trade-cash-label', isSell ? '매도 후 현금' : '매수 후 현금');
        }

        function updateSelectedStockPreview() {
            const ticker = String(getEl('input-ticker')?.value || selectedTicker || '').trim();
            const data = ticker ? marketData[ticker] : null;
            const name = String(data?.name || getEl('input-name')?.value || '종목을 선택하세요');
            const price = Number(data?.price || getEl('input-price')?.value || 0);
            let yieldPct = Number(data?.yield || 0);
            if (yieldPct > 0 && yieldPct < 1) yieldPct *= 100;
            const visual = getStockVisual(name, ticker, '#7132f5');
            const currentShares = getCurrentSharesForTicker(ticker);
            const isSell = currentTransactionMode === 'sell';

            safeSetText('trade-preview-icon', visual.label || '?');
            const icon = getEl('trade-preview-icon');
            if (icon) icon.style.background = `linear-gradient(145deg, ${visual.bgColor}, #7132f5)`;
            safeSetText('trade-preview-name', data ? name : '종목을 선택하세요');
            safeSetText('trade-preview-ticker', data ? ticker : '퀵슬롯에서 종목 선택');
            safeSetText('trade-preview-price', price > 0 ? `₩${Math.round(price).toLocaleString()}` : '₩0');
            safeSetText('trade-preview-yield', `연 ${Number(yieldPct || 0).toFixed(2)}%`);
            safeSetText('trade-metric-left-label', isSell ? '보유 수량' : '배당수익률(연)');
            safeSetText('trade-metric-left-value', isSell ? `${currentShares.toLocaleString()}주` : `${Number(yieldPct || 0).toFixed(2)}%`);
            safeSetText('trade-metric-right-label', isSell ? '평가손익' : '현재 단가');
            safeSetText('trade-metric-right-value', isSell ? '계산 중' : (price > 0 ? `₩${Math.round(price).toLocaleString()}` : '₩0'));
            updateTradeSummary();
        }

        function updateDepositSummary() {
            const amount = Number(getEl('div-amount')?.value || 0);
            const cat = normalizeCashCategory(getEl('wallet-category')?.value || '1');
            const state = getPortfolioState();
            const isDividend = cat === '3';
            const monthKey = currentMonthlyModeKey || getCurrentMonthKey();
            const editId = String(getEl('edit-id')?.value || '').trim();
            const previewTransactions = editId
                ? transactions.filter((tx) => String(tx.id) !== editId)
                : transactions;
            const previewState = editId ? simulatePortfolioState(previewTransactions) : state;
            const previewCash = Object.values(previewState?.cash || {}).reduce((sum, value) => sum + Number(value || 0), 0);
            let report = editId ? getCurrentMonthReport(previewTransactions, monthKey) : monthlyReportCache.get(monthKey);
            if (!report || !Number.isFinite(Number(report.totalDepositAmount))) {
                report = getCurrentMonthReport(previewTransactions, monthKey);
            }
            const after = previewCash + Math.max(0, amount);
            const cashDepositTotal = Number(report?.depositAmountByCategory?.['1'] || 0) + Number(report?.depositAmountByCategory?.['2'] || 0);
            const monthTotal = cashDepositTotal + (isDividend ? 0 : Math.max(0, amount));
            const dividendBase = Number(report?.dividendIn || 0) + (isDividend ? Math.max(0, amount) : 0);
            const target = 50000;
            const remaining = Math.max(0, target - dividendBase);
            const pct = Math.max(0, Math.min(100, (dividendBase / target) * 100));

            safeSetText('cash-after-amount', `₩${Math.round(after).toLocaleString()}`);
            safeSetText('cash-monthly-total', `₩${Math.round(isDividend ? dividendBase : monthTotal).toLocaleString()}`);
            safeSetText('cash-summary-left-label', isDividend ? '이번 달 배당 합계' : '입금 후 현금');
            safeSetText('cash-summary-right-label', isDividend ? '다음 목표까지' : '이번 달 입금 합계');
            safeSetText('cash-summary-caption', isDividend ? '목표 50,000원' : '목표 1,000,000원');
            safeSetText('dividend-next-goal-summary', `₩${Math.round(remaining).toLocaleString()}`);
            safeSetText('dividend-progress-pct', `${Math.round(pct)}%`);
            const bar = getEl('dividend-progress-bar');
            if (bar) bar.style.width = `${pct}%`;
        }

        function updateCashModeCopy() {
            const isDividend = normalizeCashCategory(getEl('wallet-category')?.value || '1') === '3';
            safeSetText('cash-mode-icon', isDividend ? '₩' : '↓');
            safeSetText('cash-mode-title', isDividend ? '배당 입금' : '현금 입금');
            safeSetText('cash-mode-desc', isDividend ? 'ETF 배당금 입금 내역을 기록합니다.' : 'ISA 계좌 현금으로 입금하는 내역을 기록합니다.');
            safeSetText('amount-input-label', isDividend ? '배당금' : '충전 금액');
            safeSetText('save-div-btn', isDividend ? '배당 기록 추가' : '입금 기록 추가');
            const quickPresets = isDividend
                ? [{ id: 'quick-amount-1', label: '+1천', value: 1000 }, { id: 'quick-amount-2', label: '+5천', value: 5000 }, { id: 'quick-amount-3', label: '+1만', value: 10000 }]
                : [{ id: 'quick-amount-1', label: '+10만', value: 100000 }, { id: 'quick-amount-2', label: '+50만', value: 500000 }, { id: 'quick-amount-3', label: '+100만', value: 1000000 }];
            quickPresets.forEach((preset) => {
                const button = getEl(preset.id);
                if (!button) return;
                button.innerText = preset.label;
                button.onclick = () => adjustDepositAmount(preset.value);
            });
            const summary = getEl('dividend-progress-summary');
            if (summary) summary.classList.toggle('hidden', !isDividend);
            updateDepositSummary();
        }

        window.adjustDepositAmount = (amount) => {
            const input = getEl('div-amount');
            if (!input) return;
            input.value = String(Number(input.value || 0) + Number(amount || 0));
            updateDepositSummary();
        };

        function ensureTradeSelection() {
            if (selectedTicker && marketData[selectedTicker]) return;
            const firstTicker = Object.keys(marketData || {})[0];
            if (!firstTicker || !marketData[firstTicker]) return;
            const data = marketData[firstTicker];
            selectedTicker = firstTicker;
            if (getEl('input-ticker')) getEl('input-ticker').value = firstTicker;
            if (getEl('input-name')) getEl('input-name').value = data.name || firstTicker;
            if (getEl('input-price')) getEl('input-price').value = data.price || '';
        }

        function requestRecordConfirmation({ kind, title, subtitle, icon, tone = 'purple', rows = [], confirmLabel = '기록 추가' }) {
            const modal = getEl('record-confirm-modal');
            if (!modal) return Promise.resolve(true);
            safeSetText('record-confirm-title', title || '기록 확인');
            safeSetText('record-confirm-subtitle', subtitle || '내용을 확인해주세요');
            safeSetText('record-confirm-icon', icon || '✓');
            safeSetText('record-confirm-ok', confirmLabel);
            const iconEl = getEl('record-confirm-icon');
            if (iconEl) iconEl.dataset.tone = tone;
            const body = getEl('record-confirm-body');
            if (body) {
                body.innerHTML = rows.map((row) => `
                    <div class="confirm-row">
                        <span>${escapeHtml(row.label || '')}</span>
                        <strong>${escapeHtml(row.value || '')}</strong>
                    </div>
                `).join('');
            }
            modal.classList.remove('hidden');
            return new Promise((resolve) => {
                const cleanup = (answer) => {
                    modal.classList.add('hidden');
                    modal.querySelectorAll('[data-confirm-action]').forEach((el) => {
                        el.removeEventListener('click', onClick);
                    });
                    resolve(answer);
                };
                const onClick = (event) => {
                    cleanup(event.currentTarget?.dataset?.confirmAction === 'ok');
                };
                modal.querySelectorAll('[data-confirm-action]').forEach((el) => {
                    el.addEventListener('click', onClick, { once: true });
                });
            });
        }

        window.switchTransactionMode = (mode) => {
            const nextMode = ['buy', 'sell', 'deposit'].includes(mode) ? mode : 'buy';
            currentTransactionMode = nextMode;
            const modeInput = getEl('transaction-mode');
            if (modeInput) modeInput.value = nextMode;

            const isTrade = nextMode === 'buy' || nextMode === 'sell';
            getEl('tab-content-purchase')?.classList.toggle('hidden', !isTrade);
            getEl('tab-content-deposit')?.classList.toggle('hidden', isTrade);

            const tabMap = {
                buy: getEl('tab-btn-purchase'),
                sell: getEl('tab-btn-sell'),
                deposit: getEl('tab-btn-deposit')
            };
            Object.entries(tabMap).forEach(([key, btn]) => {
                if (!btn) return;
                btn.classList.remove('active-purchase', 'active-sell', 'active-deposit');
                if (key === nextMode) btn.classList.add(
                    key === 'buy' ? 'active-purchase' :
                    key === 'sell' ? 'active-sell' :
                    'active-deposit'
                );
            });

            if (nextMode === 'deposit') setDepositCat(1);
            if (isTrade) {
                ensureTradeSelection();
                safeSetText('save-btn', nextMode === 'sell' ? '매도 기록 추가' : '기록 추가');
                updateQuickSelectUI();
                updateSelectedStockPreview();
            } else {
                updateCashModeCopy();
            }
        };

        function switchTab(type) {
            switchTransactionMode(type === 'purchase' ? 'buy' : 'deposit');
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
            updateCashModeCopy();
        }

        function updateDividendTickerOptions() {
            const select = getEl('div-ticker');
            if (!select) return;
            const prev = String(select.value || 'DEPOSIT');
            const tickers = Object.keys(marketData || {});
            select.innerHTML = `<option value="DEPOSIT">배당 종목 선택</option>${tickers.map(ticker => `<option value="${escapeHtml(ticker)}">${escapeHtml(String(marketData[ticker]?.name || ticker))}</option>`).join('')}`;
            select.value = (prev === 'DEPOSIT' || tickers.includes(prev)) ? prev : 'DEPOSIT';
        }

        async function syncAllData() {
            if (isSyncing) { setSyncStatus("동기화 진행 중...", 'info'); return; }
            isSyncing = true;
            setSyncStatus("동기화 중...", 'info');
            const icon = getEl('sync-icon'); if(icon) icon.classList.add('sync-spin');
            try {
                if(!firestoreDb && !initFirebase()) {
                    setSyncStatus("동기화 실패 - FIREBASE_INIT: 파이어베이스 미연결", 'error', '기록 저장소 연결을 확인해주세요.');
                    return;
                }
                await ensureFirebaseAuth();
                const hasPriceUrl = Boolean(PRICE_CACHE_URL) || isValidSheetsUrl(sheetsUrl);
                let priceSyncFailed = false;
                let priceSyncMeta = null;
                let historyRecoveredWithFallback = false;
                let historyPreservedFromLocal = false;

                if(hasPriceUrl) {
                    try {
                        marketData = await loadPriceData();
                    } catch (e) {
                        priceSyncMeta = getSyncErrorMeta(e, 'PRICE_FETCH');
                        console.error(`[SYNC][PRICE_FETCH][${priceSyncMeta.code}]`, e);
                        priceSyncFailed = true;
                        const rememberedPrices = readRememberedPriceData();
                        if (rememberedPrices) {
                            marketData = rememberedPrices.data;
                            priceDataMeta = {
                                status: 'stored',
                                updatedAt: rememberedPrices.updatedAt,
                                savedAt: rememberedPrices.savedAt,
                                stale: true
                            };
                            priceSyncMeta = {
                                code: 'PRICE_STALE_USED',
                                reason: '마지막 정상 가격 사용'
                            };
                        }
                    }
                }

                try {
                    const applied = applyLoadedTransactions(await loadTransactionsFromFirebase());
                    historyPreservedFromLocal = applied.preserved;
                } catch(e) {
                    console.error(e);
                    const fallbackCollection = 'isa_history';
                    if(firebaseCollection !== fallbackCollection) {
                        try {
                            firebaseCollection = fallbackCollection;
                            const applied = applyLoadedTransactions(await loadTransactionsFromFirebase());
                            historyPreservedFromLocal = applied.preserved;
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
                if(historyPreservedFromLocal) setSyncStatus("오프라인/캐시 응답 · 저장된 기록 유지" + loadedHint, 'warn', '빈 캐시 응답으로 기존 기록을 덮어쓰지 않았습니다.');
                else if(historyRecoveredWithFallback) setSyncStatus("컬렉션 자동 복구 · 기록 동기화됨" + loadedHint, 'warn');
                else if(!hasPriceUrl) setSyncStatus("가격 URL 미설정 · 기록만 동기화됨" + loadedHint, 'warn', '가격 주소가 없어 보유 기록만 갱신했습니다.');
                else if(priceSyncMeta?.code === 'PRICE_STALE_USED') setSyncStatus(`가격 일시 지연 · 마지막 정상 가격 표시${loadedHint}`, 'warn');
                else if(priceSyncFailed) setSyncStatus(`가격 연결 실패(${priceSyncMeta?.code || 'PRICE_FETCH'}) · 기록은 동기화됨${loadedHint}`, 'warn', priceSyncMeta?.reason || '가격 서버 응답을 확인해주세요.');
                else setSyncStatus("최근 업데이트: " + new Date().toLocaleTimeString() + loadedHint, 'ok');
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
            const mode = String(getEl('transaction-mode')?.value || currentTransactionMode || 'buy');
            const isSell = mode === 'sell';
            const defaultLabel = editId ? '수정 저장' : (isSell ? '매도 기록 추가' : '기록 추가');
            const originalTx = editId ? transactions.find(x => String(x.id) === String(editId)) : null;
            if (!date || !ticker || shares <= 0 || price <= 0) {
                setFormStatus('purchase-form-status', '날짜, 종목, 수량, 가격을 확인해주세요.', 'error');
                if (!date) getEl('input-date')?.focus();
                else if (!ticker) getEl('quick-select-buttons')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                else if (shares <= 0) getEl('input-shares')?.focus();
                else getEl('input-price')?.focus();
                return;
            }
            const fee = calculateTradeFee(shares, price);
            const proposedTrade = {
                id: editId || '__main_trade_preview__',
                date,
                ticker,
                shares: isSell ? -Math.abs(shares) : Math.abs(shares),
                price,
                side: isSell ? 'sell' : 'buy',
                createdAtMs: Number(originalTx?.createdAtMs || Date.now())
            };
            const oversell = findCandidateOversell([proposedTrade], { excludeIds: editId ? [editId] : [] });
            if (oversell) {
                const affectedDate = String(oversell.tx?.date || '').substring(0, 10);
                setFormStatus(
                    'purchase-form-status',
                    `${affectedDate ? `${affectedDate} ` : ''}${oversell.ticker} 매도가 해당 시점 보유 수량(${oversell.availableShares.toLocaleString()}주)을 초과하게 됩니다.`,
                    'error'
                );
                getEl('input-shares')?.focus();
                return;
            }
            const settledAmount = isSell ? Math.max(0, shares * price - fee) : shares * price + fee;
            const confirmOk = await requestRecordConfirmation({
                kind: isSell ? 'sell' : 'buy',
                title: isSell ? '매도 기록 확인' : '매수 기록 확인',
                subtitle: `${name || ticker} · ${ticker}`,
                icon: isSell ? '↘' : '🛒',
                tone: isSell ? 'red' : 'purple',
                confirmLabel: isSell ? '매도 기록 추가' : '기록 추가',
                rows: [
                    { label: '수량', value: `${Number(shares).toLocaleString()}주` },
                    { label: '단가', value: `₩${Math.round(price).toLocaleString()}` },
                    { label: isSell ? '예상 입금' : '예상 결제', value: `₩${Math.round(settledAmount).toLocaleString()}` },
                    { label: '수수료', value: `₩${fee.toLocaleString()}` },
                    { label: isSell ? '매도 후 보유' : '매수 후 보유', value: getEl('trade-post-shares')?.textContent || '-' }
                ]
            });
            if (!confirmOk) return;
            const btn = getEl('save-btn');
            let completed = false;
            setFormStatus('purchase-form-status', '저장 중입니다...', 'info');
            setButtonBusy(btn, true, '처리 중...', defaultLabel);
            try {
                const payload = {
                    id: editId || createTxnId(),
                    date,
                    ticker,
                    name,
                    shares: isSell ? -Math.abs(shares) : Math.abs(shares),
                    price,
                    fee,
                    category: 0,
                    side: isSell ? 'sell' : 'buy',
                    keepCreatedAtMs: Number(originalTx?.createdAtMs || 0)
                };
                const savedId = await postMutation('add', payload);
                await syncAfterAdd(payload, savedId);
                completed = true;
                setFormStatus('purchase-form-status', '저장 완료', 'success');
                resetPurchaseForm(); showSection('dashboard');
            } catch(e) {
                console.error(e);
                setFormStatus('purchase-form-status', '저장 실패: ' + (e?.message || '네트워크 오류'), 'error');
            }
            setButtonBusy(btn, false, completed ? (isSell ? '매도 기록 추가' : '기록 추가') : defaultLabel, completed ? (isSell ? '매도 기록 추가' : '기록 추가') : defaultLabel);
        }

        window.exitEditMode = () => { resetPurchaseForm(); showSection('history'); };

        function resetPurchaseForm() {
            if(getEl('input-shares')) getEl('input-shares').value = ""; 
            if(getEl('input-price')) getEl('input-price').value = "";
            if(getEl('div-amount')) getEl('div-amount').value = "";
            if(getEl('edit-id')) getEl('edit-id').value = ""; 
            if(getEl('save-btn')) getEl('save-btn').innerText = currentTransactionMode === 'sell' ? "매도 기록 추가" : "기록 추가";
            if(getEl('save-div-btn')) getEl('save-div-btn').innerText = normalizeCashCategory(getEl('wallet-category')?.value || '1') === '3' ? "배당 기록 추가" : "입금 기록 추가";
            if(getEl('cancel-edit-btn')) getEl('cancel-edit-btn').classList.add('hidden');
            if(getEl('cancel-edit-btn-deposit')) getEl('cancel-edit-btn-deposit').classList.add('hidden');
            if(getEl('div-ticker')) getEl('div-ticker').value = "DEPOSIT";
            setFormStatus('purchase-form-status');
            setFormStatus('deposit-form-status');
            selectedTicker = ""; updateQuickSelectUI(); updateSelectedStockPreview(); updateDepositSummary();
        }

        async function saveWalletDeposit() {
            const date = getEl('div-date').value, amount = Number(getEl('div-amount').value), cat = normalizeCashCategory(getEl('wallet-category').value), editId = getEl('edit-id').value;
            const defaultLabel = editId ? '수정 저장' : (cat === '3' ? '배당 기록 추가' : '입금 기록 추가');
            const originalTx = editId ? transactions.find(x => String(x.id) === String(editId)) : null;
            if(!date || !Number.isFinite(amount) || amount <= 0) {
                setFormStatus('deposit-form-status', '날짜와 0보다 큰 금액을 입력해주세요.', 'error');
                if(!date) getEl('div-date')?.focus();
                else getEl('div-amount')?.focus();
                return;
            }
            const selectedDividendTicker = String(getEl('div-ticker')?.value || 'DEPOSIT').trim();
            const dividendTicker = selectedDividendTicker || 'DEPOSIT';
            if (cat === '3' && dividendTicker === 'DEPOSIT') {
                alert('배당금은 배당 종목을 반드시 선택해야 해요. 그래야 S&P500/순수슈드 버킷이 정확히 나뉩니다.');
                getEl('div-ticker')?.focus();
                return;
            }
            const dividendName = String(marketData?.[dividendTicker]?.name || dividendTicker).trim();
            const depositTicker = cat === '3' ? dividendTicker : 'DEPOSIT';
            const depositName = cat === '3'
                ? (depositTicker === 'DEPOSIT' ? '배당 입금' : `${dividendName} 배당 입금`)
                : '현금 입금';
            const confirmOk = await requestRecordConfirmation({
                kind: cat === '3' ? 'dividend' : 'deposit',
                title: cat === '3' ? '배당 기록 확인' : '입금 기록 확인',
                subtitle: cat === '3' ? depositName : 'ISA 현금 입금',
                icon: cat === '3' ? '✓' : '🏦',
                tone: cat === '3' ? 'green' : 'purple',
                confirmLabel: cat === '3' ? '배당 추가' : '입금 추가',
                rows: [
                    { label: '금액', value: `₩${Math.round(amount).toLocaleString()}` },
                    { label: '구분', value: CAT_NAMES[cat] || '입금' },
                    { label: '날짜', value: String(date).substring(0, 10) },
                    { label: cat === '3' ? '종목' : '입금 후 현금', value: cat === '3' ? dividendName : (getEl('cash-after-amount')?.textContent || '-') }
                ]
            });
            if (!confirmOk) return;
            const btn = getEl('save-div-btn');
            let completed = false;
            setFormStatus('deposit-form-status', '저장 중입니다...', 'info');
            setButtonBusy(btn, true, '처리 중...', defaultLabel);
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
                completed = true;
                setFormStatus('deposit-form-status', '저장 완료', 'success');
                resetPurchaseForm(); showSection('dashboard');
            } catch(e) {
                console.error(e);
                setFormStatus('deposit-form-status', '충전 실패: ' + (e?.message || '네트워크 오류'), 'error');
            }
            setButtonBusy(btn, false, completed ? '충전하기' : defaultLabel, completed ? '충전하기' : defaultLabel);
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
                setFormStatus('detail-trade-status', '종목 정보를 찾지 못했습니다. 상세 창을 다시 열어 주세요.', 'error');
                return;
            }
            if(!date || !sharesInput || price <= 0) {
                setFormStatus('detail-trade-status', '날짜, 수량, 가격을 확인해주세요.', 'error');
                if(!date) getEl('detail-trade-date')?.focus();
                else if(!sharesInput) getEl('detail-trade-shares')?.focus();
                else getEl('detail-trade-price')?.focus();
                return;
            }
            if(isSell) {
                const oversell = findCandidateOversell([{
                    id: '__detail_sell_preview__',
                    date,
                    ticker: detailModalTicker,
                    shares,
                    price,
                    side: 'sell',
                    createdAtMs: Date.now()
                }]);
                if(oversell) {
                    setFormStatus('detail-trade-status', `해당 시점 보유 수량(${oversell.availableShares.toLocaleString()}주)을 초과해 매도할 수 없습니다.`, 'error');
                    getEl('detail-trade-shares')?.focus();
                    return;
                }
            }

            setFormStatus('detail-trade-status', '저장 중입니다...', 'info');
            setButtonBusy(actionBtn, true, '처리 중...', defaultLabel);
            try {
                const payload = {
                    id: createTxnId(),
                    date,
                    ticker: detailModalTicker,
                    name: detailModalName,
                    shares,
                    price,
                    fee: calculateTradeFee(shares, price),
                    category: 0,
                    side: isSell ? 'sell' : 'buy'
                };
                const savedId = await postMutation('add', payload);
                await syncAfterAdd(payload, savedId);
                setFormStatus('detail-trade-status', '저장 완료', 'success');
                if(getEl('detail-trade-shares')) getEl('detail-trade-shares').value = '';
                openDetailModal(detailModalTicker);
                switchDetailTab('history');
            } catch (e) {
                console.error(e);
                setFormStatus('detail-trade-status', '저장 실패: ' + (e?.message || '네트워크 오류'), 'error');
            }
            setButtonBusy(actionBtn, false, defaultLabel, defaultLabel);
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
                const rawPrice = Number(m.price || 0);
                const safePrice = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : avgPrice;
                let yieldPct = Number(m.yield || 0); if(yieldPct < 1 && yieldPct > 0) yieldPct *= 100;
                const val = d.shares * safePrice, profit = val - d.cost, prate = d.cost > 0 ? (profit/d.cost)*100 : 0, div = val * (yieldPct/100/12);
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
            animateValue('stat-total-value', 0, Math.round(totalV + curCash), 900);
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
            const dashboardMonthKey = monthReport.monthKey || currentMonthlyModeKey || getCurrentMonthKey();
            const [dashboardYear, dashboardMonth] = String(dashboardMonthKey || '').split('-');
            safeSetText('dashboard-month-pill', dashboardYear && dashboardMonth ? `${dashboardYear}년 ${Number(dashboardMonth)}월` : dashboardMonthKey || '-');
            safeSetText('hero-expected-dividend', `₩${Math.round(totalD).toLocaleString()}`);
            safeSetText('hero-monthly-return', `${monthReport.totalReturnAmount >= 0 ? '+' : '-'}₩${Math.round(Math.abs(monthReport.totalReturnAmount || 0)).toLocaleString()}`);
            safeSetText('report-month-label', monthReport.monthKey || '-');
            safeSetText('report-realized-pnl', `₩${Math.round(monthReport.realizedPnl).toLocaleString()}`);
            safeSetText('report-dividend-in', `₩${Math.round(monthReport.totalReturnAmount || 0).toLocaleString()} (${Number(monthReport.monthlyTotalReturnRate || 0).toFixed(2)}%)`);
            const monthlyReturnEl = getEl('hero-monthly-return');
            if (monthlyReturnEl) {
                monthlyReturnEl.classList.remove('text-emerald-300', 'text-blue-300', 'text-slate-300');
                monthlyReturnEl.classList.add(monthReport.totalReturnAmount > 0 ? 'text-emerald-300' : (monthReport.totalReturnAmount < 0 ? 'text-blue-300' : 'text-slate-300'));
            }
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
            const plansWrap = getEl('cash-buy-plans');
            const emptyBox = getEl('cash-buy-empty');
            const isaPlan = buildIsaPlanRecommendation(state, usableCash);
            if(plansWrap) {
                plansWrap.classList.remove('hidden');
                plansWrap.innerHTML = renderIsaPlanRecommendation(isaPlan);
                applyAiRecommendationCollapsedState();
            }
            if(emptyBox) emptyBox.classList.add('hidden');
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
                
                
const chartLabels = totalV > 0 ? labels : [];
const chartData = totalV > 0 ? data : [];
const chartBg = totalV > 0 ? bg : [];
if(assetChart){
    assetChart.data.labels = chartLabels;
    assetChart.data.datasets[0].data = chartData;
    assetChart.options.animation = lowPowerMode ? false : { animateRotate: true, duration: 450 };
    assetChart.update(lowPowerMode ? 'none' : undefined);
} else {
    assetChart = new Chart(getEl('assetChart').getContext('2d'), {
        plugins:[centerTextPlugin],
 type: 'doughnut', data: { labels: chartLabels, datasets: [{ data: chartData, backgroundColor: chartBg, borderWidth: 3, borderColor: '#ffffff' }] }, options: { cutout: '82%', plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false,
                animation: {
                    animateRotate: true,
                    duration: 450
                }
            } }); }
            }
            safeSetHTML('chart-legend', totalV > 0
                ? labels.map((l, i) => {
                    const pct = totalV > 0 ? (data[i] / totalV) * 100 : 0;
                    return `<div class="flex justify-between text-[10px] mb-2 font-black transition hover:translate-x-1 text-left font-sans"><span class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full" style="background:${bg[i]}"></span><span class="truncate w-24 text-slate-500 font-sans">${escapeHtml(l)}</span></span><span class="text-slate-800 text-right font-sans">${pct.toFixed(1)}%</span></div>`;
                }).join('')
                : `<div class="text-[10px] font-black text-slate-400 text-left font-sans">가격 데이터 대기 중</div>`);
            updateAssetAllocationUI();
            renderHistoryIfVisible();
            updateSelectedStockPreview();
            updateDepositSummary();


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

        function renderHistoryList(containerId, data, options = {}) {
            const container = getEl(containerId); if (!container) return;
            const signature = [
                containerId,
                transactionsVersion,
                data.length,
                historyFilterDays,
                historyVisibleCount
            ].join('|');
            if (!options.force && !historyNeedsRender && historyRenderSignature === signature) {
                updateHistoryFilterUI();
                return;
            }
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
            historyRenderSignature = signature;
            historyNeedsRender = false;
        }

        function updateQuickSelectUI() {
            const box = getEl('quick-select-buttons'); if(!box) return;
            const tickers = Object.keys(marketData);
            if(tickers.length > 0) {
                if (!selectedTicker || !marketData[selectedTicker]) {
                    const firstTicker = tickers[0];
                    const firstData = marketData[firstTicker] || {};
                    selectedTicker = firstTicker;
                    if (getEl('input-ticker')) getEl('input-ticker').value = firstTicker;
                    if (getEl('input-name')) getEl('input-name').value = firstData.name || firstTicker;
                    if (getEl('input-price')) getEl('input-price').value = firstData.price || '';
                }
                box.innerHTML = tickers.map(k => {
                    const data = marketData[k] || {};
                    const visual = getStockVisual(data.name, k, '#7132f5');
                    const activeClass = selectedTicker === k ? 'bg-slate-900 text-white border-slate-900 shadow-lg font-sans' : 'bg-white text-slate-500 border-slate-100 shadow-sm font-sans';
                    return `<button type="button" data-ticker="${escapeHtml(k)}" class="quick-select-btn ${activeClass}" style="--quick-color:${visual.bgColor}"><span class="quick-slot-avatar">${escapeHtml(visual.label)}</span><strong>${escapeHtml(data.name || k)}</strong><small>${escapeHtml(k)}</small>${selectedTicker === k ? '<i class="fa-solid fa-check"></i>' : ''}</button>`;
                }).join('');
                updateSelectedStockPreview();
            } else box.innerHTML = `<div class="text-[10px] text-slate-300 p-4 border border-dashed border-slate-200 rounded-xl w-full text-center font-black uppercase font-sans">데이터 수신 대기...</div>`; 
        }

        window.fillForm = (k) => {
            const d = marketData[k]; if(!d) return;
            selectedTicker = k; getEl('input-ticker').value = k; getEl('input-name').value = d.name; getEl('input-price').value = d.price; updateQuickSelectUI(); updateSelectedStockPreview();
        };

        window.openRecommendedTrade = (ticker, qty = 0) => {
            showSection('transaction');
            switchTransactionMode('buy');
            fillForm(String(ticker || ''));
            if (Number(qty || 0) > 0 && getEl('input-shares')) {
                getEl('input-shares').value = String(qty);
                updateTradeSummary();
            }
            getEl('input-shares')?.focus();
        };

        window.editTransaction = (id) => {
            const t = transactions.find(x => x.id == id); if(!t) return;
            const isDeposit = isDepositTransaction(t);
            if(isDeposit) {
                showSection('transaction'); switchTab('deposit');
                getEl('div-date').value = String(t.date).substring(0,10); getEl('div-amount').value = t.price;
                getEl('edit-id').value = id;
                setDepositCat(normalizeCashCategory(t.category));
                if (normalizeCashCategory(t.category) === '3' && getEl('div-ticker')) {
                    const depositTicker = String(t.ticker || 'DEPOSIT').trim() || 'DEPOSIT';
                    getEl('div-ticker').value = depositTicker;
                }
                getEl('save-div-btn').innerText = "수정 저장"; getEl('cancel-edit-btn-deposit').classList.remove('hidden');
            } else {
                const isSell = String(t?.side || '').toLowerCase() === 'sell' || Number(t?.shares || 0) < 0;
                showSection('transaction'); switchTransactionMode(isSell ? 'sell' : 'buy');
                getEl('input-date').value = String(t.date).substring(0,10); getEl('input-ticker').value = t.ticker; getEl('input-name').value = t.name; getEl('input-shares').value = Math.abs(Number(t.shares || 0)); getEl('input-price').value = t.price;
                getEl('edit-id').value = id; getEl('save-btn').innerText = "수정 저장"; getEl('cancel-edit-btn').classList.remove('hidden');
                selectedTicker = t.ticker; updateQuickSelectUI(); updateSelectedStockPreview();
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
                setSyncStatus('삭제 완료 · 백그라운드 동기화 중...', 'info');
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
            const sortedTradeData = getSortedTransactions(tradeData);
            const newestTrade = sortedTradeData[sortedTradeData.length - 1];
            const lastPrice = Number(marketData[ticker]?.price || newestTrade?.price || 0);
            if(getEl('detail-trade-price')) getEl('detail-trade-price').value = lastPrice || '';
            if(getEl('detail-trade-shares')) getEl('detail-trade-shares').value = '';
            setFormStatus('detail-trade-status');
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
            const saleRatioTx = [
                { id: 'r-d1', date: `${testMonth}-01`, ticker: 'DEPOSIT', name: 'principal deposit', shares: 1, price: 100000, category: '1' },
                { id: 'r-b1', date: `${testMonth}-02`, ticker: 'RATIO', name: 'ratio test', shares: 10, price: 10000, category: 0, side: 'buy' },
                { id: 'r-d2', date: `${testMonth}-03`, ticker: 'DEPOSIT', name: 'special deposit', shares: 1, price: 100000, category: '2' },
                { id: 'r-b2', date: `${testMonth}-04`, ticker: 'RATIO', name: 'ratio test', shares: 10, price: 10000, category: 0, side: 'buy' },
                { id: 'r-d3', date: `${testMonth}-05`, ticker: 'DEPOSIT', name: 'dividend deposit', shares: 1, price: 100000, category: '3' },
                { id: 'r-b3', date: `${testMonth}-06`, ticker: 'RATIO', name: 'ratio test', shares: 10, price: 10000, category: 0, side: 'buy' },
                { id: 'r-s1', date: `${testMonth}-07`, ticker: 'RATIO', name: 'ratio test', shares: -15, price: 12000, side: 'sell' }
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
            const saleRatioState = simulatePortfolioState(saleRatioTx);
            const report = getCurrentMonthReport(sampleTx, testMonth);
            const currentHistoryFilter = historyFilterDays;
            historyFilterDays = '30';
            const filteredOldTrade = filterHistoryByRange([oldTradeEnteredNow]);
            historyFilterDays = currentHistoryFilter;
            const importMappedRows = mapTableRowsToImportRows([
                ['거래일', '거래구분', '종목코드', '종목명', '수량', '체결단가', '체결금액'],
                [`${testMonth}-08`, '매수', '360750', 'TIGER 미국S&P500', '3', '18250', '54750'],
                [`${testMonth}-09`, '배당', '360750', 'TIGER 미국S&P500', '', '', '1200'],
                [`${testMonth}-10`, '매도', '360750', 'TIGER 미국S&P500', '2', '19000', '38000']
            ], 'self-test.csv');
            const importBuyPayload = importRowToPayload(createImportRow(importMappedRows[0], 'self-test.csv'));
            const importDividendPayload = importRowToPayload(createImportRow(importMappedRows[1], 'self-test.csv'));
            const importSellPayload = importRowToPayload(createImportRow(importMappedRows[2], 'self-test.csv'));
            const unknownSideRow = createImportRow({
                date: `${testMonth}-11`,
                ticker: '360750',
                name: 'TIGER 미국S&P500',
                shares: 1,
                price: 18000,
                side: ''
            }, 'self-test.csv');
            const importAliasRow = createImportRow({
                date: `${testMonth}-12`,
                ticker: '',
                name: 'TIGER 미국배당다우존스',
                shares: 1,
                price: 15800,
                side: 'buy'
            }, 'self-test.csv');
            const importAliasOverrideRow = createImportRow({
                date: `${testMonth}-13`,
                ticker: '360750',
                name: 'TIGER 미국우주테크',
                shares: 1,
                price: 10950,
                side: 'buy'
            }, 'self-test.csv');
            const sameDayOrderingTx = [
                { id: 'a-buy', date: `${testMonth}-14`, ticker: 'ORDER', name: 'ordering', shares: 1, price: 100, side: 'buy', createdAtMs: 200 },
                { id: 'z-deposit', date: `${testMonth}-14`, ticker: 'DEPOSIT', name: '현금 입금', shares: 1, price: 100, category: '3', createdAtMs: 100 }
            ];
            const sameDayState = simulatePortfolioState(sameDayOrderingTx);
            const feeTx = [
                { id: 'fee-d', date: `${testMonth}-01`, ticker: 'DEPOSIT', name: '현금 입금', shares: 1, price: 10000, category: '1' },
                { id: 'fee-b', date: `${testMonth}-02`, ticker: 'FEE', name: 'fee test', shares: 10, price: 100, fee: 1, side: 'buy' },
                { id: 'fee-s', date: `${testMonth}-03`, ticker: 'FEE', name: 'fee test', shares: -2, price: 200, fee: 1, side: 'sell' }
            ];
            const feeState = simulatePortfolioState(feeTx);
            const feeReport = getCurrentMonthReport(feeTx, testMonth);
            const oversellResult = findCandidateOversell([
                { id: 'oversell-s', date: `${testMonth}-02`, ticker: 'OVER', shares: -3, price: 100, side: 'sell', createdAtMs: 2 }
            ], {
                baseTransactions: [{ id: 'oversell-b', date: `${testMonth}-01`, ticker: 'OVER', shares: 2, price: 100, side: 'buy', createdAtMs: 1 }]
            });
            const editedBuyOversell = findCandidateOversell([
                { id: 'edit-buy', date: `${testMonth}-01`, ticker: 'EDIT', shares: 5, price: 100, side: 'buy', createdAtMs: 1 }
            ], {
                baseTransactions: [
                    { id: 'edit-buy', date: `${testMonth}-01`, ticker: 'EDIT', shares: 10, price: 100, side: 'buy', createdAtMs: 1 },
                    { id: 'later-sell', date: `${testMonth}-02`, ticker: 'EDIT', shares: -8, price: 100, side: 'sell', createdAtMs: 2 }
                ],
                excludeIds: ['edit-buy']
            });
            const unrelatedLegacyOversell = findCandidateOversell([
                { id: 'new-buy', date: `${testMonth}-03`, ticker: 'NEW', shares: 1, price: 100, side: 'buy', createdAtMs: 3 }
            ], {
                baseTransactions: [
                    { id: 'legacy-sell', date: `${testMonth}-01`, ticker: 'OLD', shares: -2, price: 100, side: 'sell', createdAtMs: 1 }
                ]
            });
            const legacyDateOrder = getSortedTransactions([
                { id: 'october', date: '2026-10-01' },
                { id: 'february', date: '2026-2-01' }
            ]);
            const duplicateImportRows = [
                createImportRow({ date: '2099-12-30', ticker: 'DUPTEST', name: 'duplicate', shares: 1, price: 1234, side: 'buy' }, 'self-test.csv'),
                createImportRow({ date: '2099-12-30', ticker: 'DUPTEST', name: 'duplicate', shares: 1, price: 1234, side: 'buy' }, 'self-test.csv')
            ];
            const duplicateImportIndexes = getDuplicateImportIndexes(duplicateImportRows);
            const selectedOnlyDuplicateIndexes = getDuplicateImportIndexes([duplicateImportRows[1]]);
            const categoryImportRows = [
                createImportRow({ date: '2099-12-31', ticker: 'DEPOSIT', name: '현금 입금', amount: 5000, side: 'deposit', category: '1' }, 'self-test.csv'),
                createImportRow({ date: '2099-12-31', ticker: 'DEPOSIT', name: '현금 입금', amount: 5000, side: 'deposit', category: '2' }, 'self-test.csv')
            ];
            const categoryDuplicateIndexes = getDuplicateImportIndexes(categoryImportRows);
            const localDate = new Date(2026, 6, 14, 0, 0, 0);
            const excelSerial = Math.floor((Date.UTC(2026, 6, 14) - Date.UTC(1899, 11, 30)) / 86400000);
            const cacheWasPreserved = (() => {
                const originalTransactions = transactions;
                const cachedSentinel = [{ id: 'cache-sentinel', date: '2099-01-01', ticker: 'CACHE', name: 'cache', shares: 1, price: 1, side: 'buy' }];
                try {
                    transactions = cachedSentinel;
                    const untrustedEmpty = [];
                    Object.defineProperty(untrustedEmpty, 'loadMeta', { value: { fromCache: true, sawSnapshot: true } });
                    const cachePreserveResult = applyLoadedTransactions(untrustedEmpty);
                    return cachePreserveResult.preserved && transactions === cachedSentinel;
                } finally {
                    transactions = originalTransactions;
                }
            })();

            const checks = [
                { name: '보유수량 계산', pass: Math.abs((state.holdings.TEST?.shares || 0) - 8) < 0.0001 },
                { name: '청산 원가 계산', pass: getOpenPositionCostBasis(closedState.holdings) === 0 },
                { name: '거래일 필터 계산', pass: filteredOldTrade.length === 0 },
                { name: '월간 매수 집계', pass: report.buyActionCount === 1 && report.buyShares >= 10 },
                { name: '월간 매도 집계', pass: report.sellActionCount === 1 && report.sellShares >= 2 },
                { name: '배당 집행률 계산', pass: report.dividendIn >= report.dividendUsed },
                { name: '매도 손익 비율 배분', pass: Math.abs((saleRatioState.cash['1'] || 0) - 60000) <= 1 && Math.abs((saleRatioState.cash['2'] || 0) - 60000) <= 1 && Math.abs((saleRatioState.cash['3'] || 0) - 60000) <= 1 },
                { name: '가져오기 CSV 매핑', pass: importMappedRows.length === 3 },
                { name: '가져오기 매수 변환', pass: importBuyPayload?.side === 'buy' && importBuyPayload?.ticker === '360750' && Math.abs(importBuyPayload?.shares - 3) < 0.0001 && Number(importBuyPayload?.price) === 18250 },
                { name: '가져오기 배당 변환', pass: importDividendPayload?.category === '3' && importDividendPayload?.ticker === '360750' && Number(importDividendPayload?.price) === 1200 },
                { name: '가져오기 매도 변환', pass: importSellPayload?.side === 'sell' && Math.abs(Number(importSellPayload?.shares || 0) + 2) < 0.0001 },
                { name: '가져오기 구분 없음 기본값', pass: unknownSideRow.side === 'unknown' && !importRowToPayload(unknownSideRow) },
                { name: '가져오기 종목 alias 매칭', pass: importAliasRow.ticker === '458730' },
                { name: '가져오기 잘못된 ticker 보정', pass: importAliasOverrideRow.ticker === '0183J0' },
                { name: '동일 날짜 생성순 정렬', pass: getSortedTransactions(sameDayOrderingTx)[0]?.id === 'z-deposit' && Math.abs(Number(sameDayState.cash['3'] || 0)) < 0.001 && Math.abs(Number(sameDayState.cash['1'] || 0)) < 0.001 },
                { name: '수수료 현금·원가 반영', pass: Math.abs(Number(feeState.cash['1'] || 0) - 9398) < 0.01 && Math.abs(Number(feeState.holdings.FEE?.cost || 0) - 800.8) < 0.01 && Math.abs(Number(feeReport.realizedPnl || 0) - 198.8) < 0.01 },
                { name: '초과 매도 차단', pass: oversellResult?.ticker === 'OVER' && Math.abs(Number(oversellResult?.availableShares || 0) - 2) < 0.001 },
                { name: '매수 편집 후속 초과 매도 차단', pass: editedBuyOversell?.tx?.id === 'later-sell' && Math.abs(Number(editedBuyOversell?.availableShares || 0) - 5) < 0.001 },
                { name: '무관한 레거시 초과매도 허용', pass: unrelatedLegacyOversell === null },
                { name: '레거시 날짜 월 순서', pass: legacyDateOrder[0]?.id === 'february' },
                { name: '가져오기 배치 내 중복', pass: !duplicateImportIndexes.has(0) && duplicateImportIndexes.has(1) },
                { name: '미선택 행 중복 판정 제외', pass: selectedOnlyDuplicateIndexes.size === 0 },
                { name: '입금 카테고리별 중복 구분', pass: !categoryDuplicateIndexes.has(0) && !categoryDuplicateIndexes.has(1) },
                { name: '월간 입금 카테고리 집계', pass: report.totalDepositAmount === 100000 && report.depositAmountByCategory?.['3'] === 100000 },
                { name: '로컬·Excel 날짜 보존', pass: parseImportDate(localDate) === '2026-07-14' && parseImportDate(excelSerial) === '2026-07-14' },
                { name: '빈 오프라인 캐시 덮어쓰기 방지', pass: cacheWasPreserved }
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

        function handleImportInputEvent(e) {
            const target = e.target;
            if (!target?.dataset?.importField) return;
            updateImportRowFromField(target);
            if (e.type === 'change' && target.dataset.importField !== 'selected') {
                renderImportRows();
            }
        }

        document.addEventListener('input', handleImportInputEvent);
        document.addEventListener('change', handleImportInputEvent);

        document.addEventListener('keydown', (event) => {
            const settingsModal = getEl('settings-modal');
            const settingsOpen = settingsModal && !settingsModal.classList.contains('hidden');
            if (settingsOpen) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeSettings();
                    return;
                }
                if (event.key === 'Tab') {
                    const focusable = [...settingsModal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
                        .filter((el) => !el.disabled && el.getClientRects().length > 0);
                    if (focusable.length) {
                        const first = focusable[0];
                        const last = focusable[focusable.length - 1];
                        if (event.shiftKey && document.activeElement === first) {
                            event.preventDefault();
                            last.focus();
                        } else if (!event.shiftKey && document.activeElement === last) {
                            event.preventDefault();
                            first.focus();
                        }
                    }
                }
            }

            const holding = event.target?.closest?.('.holding-item');
            if (holding && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                const ticker = holding.dataset.ticker;
                if (ticker) openDetailModal(ticker);
            }
        });

        document.addEventListener('click', (e) => {
            const target = e.target.closest('button, .holding-item');
            if(!target) return;

            if(target.classList.contains('history-filter-btn') && target.dataset.historyFilter) {
                historyFilterDays = target.dataset.historyFilter;
                historyVisibleCount = 100;
                markHistoryDirty();
                renderHistoryList('history-list', transactions);
                return;
            }

            if(target.id === 'history-load-more') {
                historyVisibleCount += 100;
                markHistoryDirty();
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
            ['dashboard','history','import','transaction'].forEach(s => { getEl('section-'+s)?.classList.add('hidden'); });
            getEl('section-'+id)?.classList.remove('hidden');
            document.body.dataset.activeSection = id;
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            document.querySelectorAll('.nav-item').forEach(b => { b.classList.remove('active', 'text-blue-600'); b.classList.add('text-slate-300'); });
            getEl('mob-nav-'+id)?.classList.add('active', 'text-blue-600'); getEl('mob-nav-'+id)?.classList.remove('text-slate-300');
            document.querySelectorAll('.pc-nav-item').forEach(b => b.classList.remove('text-blue-600', 'border-r-4', 'border-blue-600'));
            getEl('pc-nav-'+id)?.classList.add('text-blue-600', 'border-r-4', 'border-blue-600');
            if(id === 'transaction') updateQuickSelectUI();
            if(id === 'history') renderHistoryList('history-list', transactions);
            if(id === 'import') renderImportRows();
        };
        
        window.openSettings = () => {
            const m = getEl('settings-modal');
            if(!m) return;
            settingsPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if(getEl('setting-url')) getEl('setting-url').value = sheetsUrl;
            if(getEl('setting-firebase-config')) getEl('setting-firebase-config').value = firebaseConfigRaw;
            if(getEl('setting-firebase-collection')) getEl('setting-firebase-collection').value = firebaseCollection;
            setSyncStatus(syncStatusText, syncStatusTone, syncStatusDetail);
            m.classList.remove('hidden');
            m.setAttribute('aria-hidden', 'false');
            window.setTimeout(() => m.querySelector('.settings-close-btn')?.focus(), 0);
        };
        window.closeSettings = () => {
            const m = getEl('settings-modal');
            if (!m || m.classList.contains('hidden')) return;
            m.classList.add('hidden');
            m.setAttribute('aria-hidden', 'true');
            settingsPreviousFocus?.focus?.();
            settingsPreviousFocus = null;
        };
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
    if (window.ISARICH_TEST_PAGE) return;
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
                    setSyncStatus('앱 업데이트 준비 완료', 'ok');
                }
            });
        });
    }).catch((err) => {
        console.warn('Service worker registration failed:', err);
    });
}

function initMobileBottomNavLock() {
    const formControlSelector = 'input, textarea, select, [contenteditable="true"]';
    const mobileQuery = window.matchMedia('(max-width: 1023px)');

    const hasFocusedFormControl = () => (
        document.activeElement instanceof Element
        && document.activeElement.matches(formControlSelector)
    );

    const updateState = () => {
        const visualViewport = window.visualViewport;
        const keyboardGap = visualViewport
            ? window.innerHeight - visualViewport.height - visualViewport.offsetTop
            : 0;
        const isControlFocused = hasFocusedFormControl();
        document.body.classList.toggle('mobile-control-focus', mobileQuery.matches && isControlFocused);
        document.body.classList.toggle('mobile-keyboard-open', mobileQuery.matches && isControlFocused && keyboardGap > 120);
    };

    document.addEventListener('focusin', (event) => {
        if (event.target instanceof Element && event.target.matches(formControlSelector)) {
            updateState();
        }
    });
    document.addEventListener('focusout', () => window.setTimeout(updateState, 80));
    window.visualViewport?.addEventListener('resize', updateState);
    window.visualViewport?.addEventListener('scroll', updateState);
    mobileQuery.addEventListener?.('change', updateState);
    window.addEventListener('resize', updateState);
    updateState();
}


window.onload = () => {
            const today = getLocalDateInputValue();
            if(getEl('input-date')) getEl('input-date').value = today;
            if(getEl('div-date')) getEl('div-date').value = today;
            applyLowPowerMode(lowPowerMode);
            applyAppVersion();
            initMobileBottomNavLock();
            initFirebase();
            restorePendingTransactions();
            switchTransactionMode('buy');
            ['input-shares', 'input-price'].forEach((id) => getEl(id)?.addEventListener('input', updateTradeSummary));
            ['div-amount', 'div-ticker'].forEach((id) => getEl(id)?.addEventListener('input', updateDepositSummary));
            getEl('div-ticker')?.addEventListener('change', updateDepositSummary);
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
