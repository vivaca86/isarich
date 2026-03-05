# CTA Designer Master Sources · Premium Skin Pack

이 폴더는 **디자이너 원본(Figma/Illustrator 편집용)** 목적의 CTA 마스터 파일입니다.

## 파일 구성
- `cta-master-glass.svg` : 유리 질감(Glass) 컨셉
- `cta-master-chip.svg` : 칩/대시보드(Chip) 컨셉
- `cta-master-burst.svg` : 하이라이트(Burst) 컨셉

## 사용 방법
1. Figma: `File > Place image` 또는 드래그 앤 드롭으로 SVG 가져오기
2. Illustrator: `Open`으로 열어 레이어 그룹(`id="layer-*"`) 단위 수정
3. 최종 export 시에는 64x64 또는 128x128으로 축소하여 `icons/ui/cta-*.svg`에 반영

## 편집 가이드
- 컬러 토큰은 아래 계열을 기준으로 유지
  - Primary Blue: `#2563eb`, `#38bdf8`, `#6366f1`
  - Accent Light: `#e0f2fe`, `#c7d2fe`
  - Neutral Base: `#0f172a`, `#1f2937`
- 스트로크 굵기 수정 시, 아이콘 축소(64x64) 테스트를 함께 진행하세요.


## 이번 개선 포인트
- 기존보다 대비/광원/레이어 깊이를 강화해 "기본 스킨" 느낌을 줄였습니다.
- 64x64 축소 시에도 형태가 무너지지 않도록 중심 심볼 우선으로 재정렬했습니다.
