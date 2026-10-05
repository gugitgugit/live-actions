# Actions Pulse

GitHub Actions 진행도를 보여주는 Chrome 익스텐션 (MV3, Vite + CRXJS, React).

## 설계 문서 동기화 (필수)

설계와 관련된 변경이 생기면 같은 작업 안에서 [docs/DESIGN.md](docs/DESIGN.md)를 갱신한다. 규칙은 문서 11장을 따른다.

- 대상: 결정 추가·변경·철회, 상수(폴링 주기, TTL, 진행률 상한, catch-up 시간 등), 권한, API 엔드포인트, storage 스키마, 새로 발견한 제약·한계
- 결정을 바꿀 때는 기존 근거를 지우지 말고 "변경됨 (날짜): 새 결정과 이유"를 덧붙인다
- 상단 "최종 수정" 날짜와 12장 변경 이력을 함께 갱신한다
- 작업을 마치고 보고할 때 문서에서 무엇을 고쳤는지도 알린다

## 명령

- `npm run dev` → `chrome://extensions`에서 `dist/` 로드
- `npm test` / `npm run typecheck` / `npm run build`
