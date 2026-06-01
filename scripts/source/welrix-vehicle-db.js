/* AVANTE 옵션/색상 상수 — VEHICLE_DB 가 참조 (이전엔 index.html inline) */
// 아반떼 공통 옵션 (variant마다 살짝 다르지만 대부분 동일)
const AVANTE_GASOLINE_OPTIONS = {
  convenience: { name: "컨비니언스", sub: "듀얼 풀오토 에어컨(오토디포그+미세먼지+공기청정+애프터블로우)", price: 38 },
  navi_addon: { name: "└ 인포테인먼트 내비 추가", sub: "10.25\"내비+블루링크+OTA+무드램프", price: 79, requires: ["convenience"] },
  hipass: { name: "하이패스", price: 20 },
  smart_sense: { name: "현대 스마트센스", sub: "후측방 충돌경고+BCA+RCCA+SEW", price: 69 },
  wheel_17_i: { name: "17\" 알로이 휠 & 타이어 Ⅰ", sub: "15→17인치", price: 49 },
  wheel_17_ii: { name: "17\" 알로이 휠 & 타이어 Ⅱ", sub: "16→17인치", price: 30 },
  sunroof: { name: "선루프", price: 45 },
  parking_assist_plus: { name: "파킹 어시스트 플러스", sub: "파노라마 디스플레이+SVM+BVM+RPCA", price: 129 },
  exterior_design: { name: "익스테리어 디자인", sub: "프로젝션 LED 헤드+LED 리어콤비", price: 45 },
  comfort_1: { name: "컴포트 Ⅰ", sub: "운전석/동승석 전동시트+디지털키+무선충전+2열 열선/암레스트/6:4폴딩", price: 106 },
  sage_green: { name: "세이지 그린 인테리어", price: 15 },
  builtin_cam: { name: "빌트인 캠 (보조배터리 포함)", price: 69 }
};

const AVANTE_LPI_OPTIONS = {
  convenience: { name: "컨비니언스", sub: "듀얼 풀오토 에어컨", price: 38 },
  navi_addon: { name: "└ 인포테인먼트 내비 추가", price: 79, requires: ["convenience"] },
  hipass: { name: "하이패스", price: 20 },
  smart_sense: { name: "현대 스마트센스", price: 69 },
  wheel_17_i: { name: "17\" 알로이 휠 Ⅰ", sub: "15→17인치", price: 49 },
  wheel_17_ii: { name: "17\" 알로이 휠 Ⅱ", sub: "16→17인치", price: 30 },
  sunroof: { name: "선루프", price: 45 },
  parking_assist_plus: { name: "파킹 어시스트 플러스", price: 129 },
  exterior_design: { name: "익스테리어 디자인", price: 45 },
  comfort_2: { name: "컴포트 Ⅱ", sub: "운전석/동승석 전동시트+디지털키+무선충전+2열 열선+동승석 시트백 포켓", price: 91 },
  sage_green: { name: "세이지 그린 인테리어", price: 15 }
};

const AVANTE_LPI_RENT_OPTIONS = {
  convenience: { name: "컨비니언스", price: 36 },
  navi_addon: { name: "└ 인포테인먼트 내비 추가", price: 75, requires: ["convenience"] },
  hipass: { name: "하이패스", price: 19 },
  smart_sense: { name: "현대 스마트센스", price: 66 },
  wheel_17_i: { name: "17\" 알로이 휠 Ⅰ", price: 47 },
  wheel_17_ii: { name: "17\" 알로이 휠 Ⅱ", price: 28 },
  sunroof: { name: "선루프", price: 42 },
  parking_assist_plus: { name: "파킹 어시스트 플러스", price: 122 },
  exterior_design: { name: "익스테리어 디자인", price: 42 },
  comfort_2: { name: "컴포트 Ⅱ", price: 86 }
};

const AVANTE_COLORS = [
  { name: "아틀라스 화이트", code: "SAW", hex: "#f0f0ee", price: 0 },
  { name: "에코트로닉 그레이 펄", code: "PE2", hex: "#7a7a78", price: 0 },
  { name: "아마존 그레이 메탈릭", code: "A5G", hex: "#5c5d58", price: 0 },
  { name: "메타 블루 펄", code: "PM2", hex: "#384660", price: 0 },
  { name: "사이버 그레이 메탈릭", code: "C5G", hex: "#6d6f70", price: 0 },
  { name: "미라지 그린", code: "RRR", hex: "#5d6b54", price: 0 },
  { name: "어비스 블랙 펄", code: "A2B", hex: "#1a1a1a", price: 0 }
];

/* VEHICLE_DB SSOT — PC 와 모바일이 동일 데이터/순서 사용 */
window.VEHICLE_DB = {
  manufacturers: [
    {
      manufacturer_id: "hyundai",
      manufacturer_name: "현대",
      models: [
        // ========== 캐스퍼 ==========
        {
          model_id: "casper",
          model_name: "더 뉴 캐스퍼",
          category: "경형 SUV",
          year: 2026,
          variants: [
            {
              variant_id: "passenger",
              variant_name: "가솔린 1.0 (승용)",
              vehicle_type: "승용",
              fuel: "가솔린",
              displacement_cc: 998,
              transmission: "자동 4단",
              trims: [
                { trim_id: "smart", name: "스마트", seats: 4, base_price_5: 1493, base_price_3_5: 1493, engine: "스마트스트림 가솔린 1.0",
                  fuel_economy: { combined: 14.3, urban: 13.4, highway: 15.5, co2: 115 },
                  standard_features: ["스마트스트림 1.0 + 자동 4단", "풋파킹 브레이크", "FCA(차량/보행자/자전거)", "LKA/LFA/HBA/DAW/ISLA", "운전자 주의 경고", "전방 차량 출발 알림", "7에어백+센터사이드+전복커튼", "15\" 스틸 휠", "LED DRL", "틴티드 글라스", "전동조절 미러", "직물시트(운전석 수동 높이)", "2열 벤치 폴딩", "수동 틸트 스티어링", "오토라이트", "크루즈컨트롤", "풀오토 에어컨", "후방 PDW", "후방 모니터", "8\" 디스플레이 오디오(4스피커)", "폰 프로젝션", "USB C 충전(1열)", "유아용 시트 고정장치(2열 2개)", "후석 승객 알림"],
                  available_options: ["sunroof", "active_turbo_1", "navi_plus_1", "wheel_17_pkg", "wheel_17"] },
                { trim_id: "essential", name: "디 에센셜", seats: 4, base_price_5: 1771, base_price_3_5: 1771, engine: "스마트스트림 가솔린 1.0",
                  fuel_economy: { combined: 14.3, urban: 13.4, highway: 15.5, co2: 115 },
                  standard_features: ["+루프랙", "가죽 스티어링(열선)", "동승석 선바이저 거울", "운전석 시트 암레스트", "실내 무드램프(퍼플)", "인조가죽 적용 내장(도어/콘솔)", "1열 선바이저 램프", "인조가죽 시트", "1열 열선", "운전석 통풍", "2열 5:5 분할 폴딩", "2열 분리형 헤드레스트", "버튼시동 & 스마트키", "스마트키 원격시동", "세이프티 파워 윈도우(운전석)", "리어 와이퍼&와셔", "2WD 험로주행모드(스노우/샌드/머드)", "1열 버튼 타입 도어핸들", "하이패스", "D&N 룸미러"],
                  available_options: ["sunroof", "navi_1", "active_turbo_1", "smart_sense_1", "design_pkg", "wheel_17_pkg", "wheel_17", "comfort_1", "storage", "interior_color"] },
                { trim_id: "inspiration", name: "인스퍼레이션", seats: 4, base_price_5: 2017, base_price_3_5: 2017, engine: "스마트스트림 가솔린 1.0",
                  fuel_economy: { combined: 13.8, urban: 13.0, highway: 14.8, co2: 119 },
                  standard_features: ["+FCA(교차로/정면 대향차)", "후측방 충돌 경고(주행)", "후측방 충돌방지 보조(전진 출차)", "후방 교차 충돌방지 보조", "안전 하차 경고", "SCC(스탑앤고)", "NSCC(안전구간/곡선로)", "HDA", "후륜 디스크 브레이크", "Full LED 헤드램프(프로젝션)", "LED 방향지시등 미러", "LED 리어 콤비", "17\" 알로이 휠", "RECYCLED PET 헤드라이닝", "1열 풀폴딩 시트", "2열 슬라이딩&리클라이닝", "EPB(오토홀드)", "세이프티 파워 윈도우(동승석)", "USB C 충전(2열)", "10.25\" 내비(블루링크/카페이/인카페이먼트)", "6스피커"],
                  available_options: ["sunroof", "active_turbo_2", "active_plus", "storage", "interior_color"] }
              ],
              options_master: {
                sunroof: { name: "선루프", sub: "+A필라 블랙테이프", price: 40 },
                active_turbo_1: { name: "캐스퍼 액티브 Ⅰ", sub: "카파 1.0 T-GDI 터보+라디에이터 그릴 크롬 테두리+후륜 디스크 브레이크", price: 95 },
                active_turbo_2: { name: "캐스퍼 액티브 Ⅱ", sub: "카파 1.0 T-GDI 터보+라디에이터 그릴 크롬 테두리 (인스퍼레이션 전용)", price: 90 },
                active_plus: { name: "액티브 플러스", sub: "17\" 다크 그레이 알로이 휠+리어 스포일러 (액티브Ⅱ 필요)", price: 50,
                  requires: ["active_turbo_2"] },
                navi_plus_1: { name: "인포테인먼트 내비 플러스 Ⅰ", sub: "10.25\"내비(블루링크/카페이/인카페이먼트)+6스피커+버튼시동&스마트키+스마트키 원격시동+리어 와이퍼&와셔+1열 버튼 도어핸들", price: 125 },
                navi_1: { name: "인포테인먼트 내비 Ⅰ", sub: "10.25\"내비(블루링크/카페이/인카페이먼트)+6스피커", price: 80 },
                smart_sense_1: { name: "현대 스마트센스 Ⅰ", sub: "FCA(교차로/정면)+후측방 경고+후측방 충돌방지(전진)+후방교차 충돌방지+안전하차+SCC(스탑앤고)+NSCC+EPB+HDA (※ 내비Ⅰ 동시 적용 시 NSCC/HDA 포함)", price: 110 },
                design_pkg: { name: "익스테리어 디자인", sub: "Full LED 헤드램프(프로젝션)+LED 방향지시등 미러+LED 리어콤비", price: 70 },
                wheel_17_pkg: { name: "17\" 알로이 휠 패키지", sub: "17\" 알로이 휠+타이어+후륜 디스크 브레이크", price: 60 },
                wheel_17: { name: "17\" 알로이 휠 & 타이어", sub: "(캐스퍼 액티브Ⅰ 또는 현대 스마트센스Ⅰ 선택 시)", price: 55,
                  requires_in_trim: { smart: ["active_turbo_1"] } },
                comfort_1: { name: "컴포트 Ⅰ", sub: "1열 풀폴딩+2열 슬라이딩&리클라이닝+USB C(2열)+세이프티 파워윈도우(동승석)", price: 45 },
                storage: { name: "스토리지", sub: "러기지 볼팅+동승석 시트백 보드 (컴포트Ⅰ 필요 - 디 에센셜만, 인스퍼레이션은 단독 가능)", price: 11,
                  requires_in_trim: { essential: ["comfort_1"] } },
                interior_color: { name: "실내 컬러 패키지 (베이지/오렌지 브라운)", sub: "시트/스티어링/크래시패드/콘솔/도어트림/도어암레스트/헤드라이닝/플로어매트", price: 15 }
              },
              exclusive_groups: [
                { id: "active", label: "캐스퍼 액티브", members: ["active_turbo_1", "active_turbo_2"] },
                { id: "wheel", label: "17\" 휠", members: ["wheel_17_pkg", "wheel_17"] },
                { id: "navi", label: "내비게이션", members: ["navi_plus_1", "navi_1"] }
              ]
            },
            {
              variant_id: "van",
              variant_name: "가솔린 1.0 (밴)",
              vehicle_type: "화물(밴)",
              fuel: "가솔린",
              displacement_cc: 998,
              transmission: "자동 4단",
              trims: [
                { trim_id: "van_smart", name: "밴 스마트", seats: 2, base_price_5: 1460, base_price_3_5: 1460, engine: "스마트스트림 가솔린 1.0",
                  fuel_economy: { combined: 14.3, urban: 13.4, highway: 15.5, co2: 115 },
                  standard_features: ["스마트스트림 1.0 + 자동 4단", "풋파킹 브레이크", "FCA(차량/보행자/자전거)", "LKA/LFA/HBA/DAW/ISLA", "6에어백(1열/사이드/전복커튼)", "15\" 스틸 휠", "LED DRL", "틴티드 글라스", "전동조절 미러", "직물시트", "수동 틸트 스티어링", "오토라이트", "크루즈컨트롤", "격벽 + 보호봉", "풀오토 에어컨", "마이크로 에어 필터", "후방 모니터", "8\" 디스플레이 오디오(2스피커)", "폰 프로젝션", "USB C 충전(1열)"],
                  available_options: ["active_turbo_1", "basic_plus", "comfort_2", "navi_plus_2"] },
                { trim_id: "van_smart_choice", name: "밴 스마트 초이스", seats: 2, base_price_5: 1560, base_price_3_5: 1560, engine: "스마트스트림 가솔린 1.0",
                  fuel_economy: { combined: 14.3, urban: 13.4, highway: 15.5, co2: 115 },
                  standard_features: ["+1열 센터사이드 에어백", "가죽 스티어링(열선)", "운전석 시트 암레스트", "실내 무드램프(퍼플)", "인조가죽 적용 내장(도어/콘솔)", "운전석 선바이저 램프", "인조가죽 시트", "1열 열선", "운전석 통풍", "버튼시동 & 스마트키", "스마트키 원격시동", "세이프티 파워 윈도우(운전석)", "리어 와이퍼&와셔", "1열 버튼 타입 도어핸들"],
                  available_options: ["active_turbo_1", "hipass", "navi_2"] }
              ],
              options_master: {
                active_turbo_1: { name: "캐스퍼 액티브 Ⅰ", sub: "카파 1.0 T-GDI 터보+라디에이터 그릴 크롬 테두리+후륜 디스크 브레이크", price: 95 },
                basic_plus: { name: "베이직 플러스", sub: "가죽 스티어링(열선)+하이패스+D&N 룸미러", price: 33 },
                comfort_2: { name: "컴포트 Ⅱ", sub: "인조가죽시트+1열 열선+운전석 통풍+1열 센터사이드 에어백+운전석 시트 암레스트", price: 60 },
                navi_plus_2: { name: "인포테인먼트 내비 플러스 Ⅱ", sub: "10.25\"내비(블루링크/카페이/인카페이먼트)+6스피커+버튼시동&스마트키+스마트키 원격시동+리어 와이퍼&와셔+1열 버튼 도어핸들", price: 130 },
                navi_2: { name: "인포테인먼트 내비 Ⅱ", sub: "10.25\"내비(블루링크/카페이/인카페이먼트)+6스피커", price: 85 },
                hipass: { name: "하이패스", sub: "하이패스+D&N 룸미러", price: 25 }
              }
            }
          ],
          exterior_colors: [
            { name: "아틀라스 화이트", code: "SAW", hex: "#f7f7f5", price: 0 },
            { name: "톰보이 카키", code: "TKS", hex: "#7a7556", price: 0 },
            { name: "시에나 오렌지 메탈릭", code: "SRM", hex: "#c46b3d", price: 0 },
            { name: "언블리치드 아이보리", code: "NES", hex: "#e8e0cf", price: 0 },
            { name: "어비스 블랙 펄", code: "A2B", hex: "#1a1a1a", price: 0 },
            { name: "비자림 카키 매트(무광)", code: "TKM", hex: "#4a4d3a", price: 20 }
          ]
        },
        
        // ========== 아반떼 ==========
        {
          model_id: "avante",
          model_name: "아반떼",
          category: "준중형 세단",
          year: 2026,
          variants: [
            // -- 가솔린 1.6 --
            {
              variant_id: "gasoline_1_6",
              variant_name: "가솔린 1.6 (승용)",
              vehicle_type: "승용",
              fuel: "가솔린",
              displacement_cc: 1598,
              transmission: "스마트스트림 IVT",
              trims: [
                { trim_id: "smart", name: "스마트", seats: 5, base_price_5: 2065, base_price_3_5: 2034, engine: "스마트스트림 G 1.6",
                  fuel_economy: { combined: 15.0, urban: 13.4, highway: 17.4, co2: 108 },
                  standard_features: ["FCA(차량/보행자/자전거/교차로/정면대향차)", "LKA/LFA/HBA/DAW", "ISLA", "8에어백", "15\"알로이휠", "Full LED 헤드램프", "버튼시동/스마트키", "원격시동", "웰컴시스템", "스마트 트렁크", "ECM 룸미러", "후방모니터", "8\"디스플레이오디오+무선폰프로젝션"],
                  available_options: ["convenience", "navi_addon", "hipass", "smart_sense", "wheel_17_i"] },
                { trim_id: "modern", name: "모던", seats: 5, base_price_5: 2391, base_price_3_5: 2355, engine: "스마트스트림 G 1.6",
                  fuel_economy: { combined: 14.8, urban: 13.3, highway: 17.0, co2: 111 },
                  standard_features: ["+HDA", "SCC(스탑앤고)", "NSCC", "16\"알로이휠", "가죽스티어링(열선)", "1열 열선/통풍시트", "EPB(오토홀드)", "듀얼 풀오토 에어컨", "10.25\"내비(블루링크)", "하이패스", "앰비언트 무드램프"],
                  available_options: ["sunroof", "parking_assist_plus", "exterior_design", "smart_sense", "comfort_1", "wheel_17_ii", "sage_green"] },
                { trim_id: "inspiration", name: "인스퍼레이션", seats: 5, base_price_5: 2759, base_price_3_5: 2718, engine: "스마트스트림 G 1.6",
                  fuel_economy: { combined: 14.3, urban: 12.9, highway: 16.4, co2: 115 },
                  standard_features: ["+BCA/RCCA/RPCA/SEW", "17\"알로이휠", "프로젝션 LED 헤드", "LED 리어콤비", "파노라마 디스플레이", "천연가죽시트", "운전석 전동시트(8way)", "동승석 전동시트(4way)", "2열 열선시트/암레스트/6:4폴딩", "BOSE 8스피커", "SVM", "BVM", "무선충전", "디지털키2"],
                  available_options: ["sunroof", "builtin_cam", "sage_green"] },
                { trim_id: "n_line", operating: false, name: "N 라인", seats: 5, base_price_5: 2849, base_price_3_5: 2806, engine: "스마트스트림 G 1.6",
                  fuel_economy: { combined: 13.8, urban: 12.4, highway: 15.9, co2: 119 },
                  standard_features: ["+N라인 전용 디자인", "18\"알로이휠", "후륜 멀티링크", "반펀칭 가죽스티어링(레드스티치)", "패들쉬프트", "메탈페달", "N로고 스웨이드 패치 시트"],
                  available_options: ["sunroof", "builtin_cam"] }
              ],
              options_master: AVANTE_GASOLINE_OPTIONS
            },
            // -- LPi 1.6 일반판매 --
            {
              variant_id: "lpi_1_6",
              variant_name: "LPi 1.6 (승용 · 일반판매)",
              vehicle_type: "승용",
              fuel: "LPG",
              displacement_cc: 1591,
              transmission: "자동 6단",
              trims: [
                { trim_id: "smart", name: "스마트", seats: 5, base_price_5: 2205, base_price_3_5: 2172, engine: "LPi 1.6",
                  fuel_economy: { combined: 10.5, urban: 9.3, highway: 12.4, co2: 124 },
                  standard_features: ["가솔린 스마트 동일 사양", "8에어백", "15\"알로이휠"],
                  available_options: ["convenience", "navi_addon", "hipass", "smart_sense", "wheel_17_i"] },
                { trim_id: "modern", name: "모던", seats: 5, base_price_5: 2530, base_price_3_5: 2492, engine: "LPi 1.6",
                  fuel_economy: { combined: 10.3, urban: 9.1, highway: 12.1, co2: 126 },
                  standard_features: ["+HDA", "SCC", "NSCC", "16\"알로이휠", "가죽스티어링", "1열열선/통풍", "10.25\"내비", "하이패스"],
                  available_options: ["sunroof", "parking_assist_plus", "exterior_design", "smart_sense", "comfort_2", "wheel_17_ii", "sage_green"] },
                { trim_id: "inspiration", name: "인스퍼레이션", seats: 5, base_price_5: 2886, base_price_3_5: 2843, engine: "LPi 1.6",
                  fuel_economy: { combined: 10.2, urban: 9.0, highway: 12.0, co2: 127 },
                  standard_features: ["+17\"알로이휠", "프로젝션 LED", "파노라마 디스플레이", "천연가죽시트", "전동시트 1/2열", "2열 열선시트", "BOSE 8스피커", "SVM/BVM"],
                  available_options: ["sunroof", "sage_green"] }
              ],
              options_master: AVANTE_LPI_OPTIONS
            },
            // -- LPi 1.6 렌터카 --
            {
              variant_id: "lpi_1_6_rent",
              variant_name: "LPi 1.6 (렌터카 전용)",
              vehicle_type: "승용 (렌터카)",
              fuel: "LPG",
              displacement_cc: 1591,
              transmission: "자동 6단",
              trims: [
                { trim_id: "smart", name: "스마트", seats: 5, base_price_5: 2093, base_price_3_5: 2093, engine: "LPi 1.6",
                  fuel_economy: { combined: 10.5, urban: 9.3, highway: 12.4, co2: 124 },
                  standard_features: ["LPi 스마트 동일 사양 · 렌터카 전용 가격"],
                  available_options: ["convenience", "navi_addon", "hipass", "smart_sense", "wheel_17_i"] },
                { trim_id: "modern", name: "모던", seats: 5, base_price_5: 2402, base_price_3_5: 2402, engine: "LPi 1.6",
                  fuel_economy: { combined: 10.3, urban: 9.1, highway: 12.1, co2: 126 },
                  standard_features: ["LPi 모던 동일 사양 · 렌터카 전용 가격"],
                  available_options: ["sunroof", "parking_assist_plus", "exterior_design", "smart_sense", "comfort_2", "wheel_17_ii"] }
              ],
              options_master: AVANTE_LPI_RENT_OPTIONS
            },
            // -- 하이브리드 1.6 --
            {
              variant_id: "hybrid_1_6",
              variant_name: "하이브리드 1.6",
              vehicle_type: "승용 (하이브리드)",
              fuel: "하이브리드(가솔린)",
              displacement_cc: 1580,
              transmission: "6단 DCT",
              trims: [
                { trim_id: "smart", name: "스마트", seats: 5, base_price_5: 2658, base_price_3_5: 2622, engine: "스마트스트림 HEV 1.6",
                  fuel_economy: { combined: 21.1, co2: 73 },
                  standard_features: ["FCA", "LKA/LFA/HBA/DAW", "ISLA", "8에어백", "15\"알로이", "Full LED", "버튼시동/스마트키"],
                  available_options: ["convenience", "navi_addon", "hipass", "smart_sense", "wheel_17_i"] },
                { trim_id: "modern_lite", name: "모던 라이트", seats: 5, base_price_5: 2685, base_price_3_5: 2648, engine: "스마트스트림 HEV 1.6",
                  fuel_economy: { combined: 21.1, co2: 73 },
                  standard_features: ["스마트 + 가죽스티어링(열선)+가죽 기어노브+1열 열선시트"],
                  available_options: ["convenience", "navi_addon", "hipass", "smart_sense", "wheel_17_i"] },
                { trim_id: "modern", name: "모던", seats: 5, base_price_5: 2934, base_price_3_5: 2887, engine: "스마트스트림 HEV 1.6",
                  fuel_economy: { combined: 21.0, co2: 74 },
                  standard_features: ["+HDA", "SCC", "NSCC", "16\"알로이", "1열 열선/통풍", "스마트폰 무선충전", "디지털키2", "10.25\"내비"],
                  available_options: ["sunroof", "parking_assist_plus", "exterior_design", "smart_sense", "comfort_2", "wheel_17_ii", "sage_green"] },
                { trim_id: "inspiration", name: "인스퍼레이션", seats: 5, base_price_5: 3265, base_price_3_5: 3215, engine: "스마트스트림 HEV 1.6",
                  fuel_economy: { combined: 20.7, co2: 75 },
                  standard_features: ["+17\"알로이", "프로젝션 LED", "파노라마 디스플레이", "천연가죽시트", "전동시트 1/2열", "BOSE", "SVM/BVM"],
                  available_options: ["sunroof", "sage_green"] },
                { trim_id: "n_line", operating: false, name: "N 라인", seats: 5, base_price_5: 3235, base_price_3_5: 3184, engine: "스마트스트림 HEV 1.6",
                  fuel_economy: { combined: 20.4, co2: 76 },
                  standard_features: ["+N라인 전용 디자인", "18\"알로이", "후륜 멀티링크"],
                  available_options: ["sunroof"] }
              ],
              options_master: AVANTE_LPI_OPTIONS  // 하이브리드도 LPi와 유사한 옵션 구성
            },
            // -- N 2.0 터보 (단일 트림) --
            {
              variant_id: "n_2_0_turbo",
              variant_name: "가솔린 2.0 N (고성능)",
              vehicle_type: "승용 (고성능)",
              fuel: "가솔린",
              displacement_cc: 1998,
              transmission: "8단 N DCT / 6단 수동",
              trims: [
                { trim_id: "n", name: "N", seats: 5, base_price_5: 3359, base_price_3_5: 3309, engine: "T-GDI 2.0 (280hp)",
                  fuel_economy: { combined: 10.4, co2: 161 },
                  standard_features: ["N 전용 섀시/서스펜션", "전자식 LSD", "런치컨트롤", "N 그린 시프트", "19\"알로이휠", "버킷시트(옵션)", "N 전용 인테리어"],
                  available_options: ["n_fan_package", "n_brake_package", "n_wheel_package", "n_floor_mat"] }
              ],
              options_master: {
                n_fan_package: { name: "N 팬 패키지", sub: "N DCT + 스마트센스 I/II + 시티팩 또는 트랙팩 (100만 할인)", price: 380 },
                n_brake_package: { name: "대용량 브레이크 패키지", sub: "레드 캘리퍼+대용량 디스크+로우스틸 패드", price: 39 },
                n_wheel_package: { name: "디자인 휠 패키지", sub: "18\" 스포츠 디자인 휠+N로고 스피닝 휠캡", price: 67 },
                n_floor_mat: { name: "N로고 플로어 매트", price: 20 }
              }
            }
          ],
          exterior_colors: AVANTE_COLORS
        },
        
        // ========== 쏘나타 디 엣지 (25.9.29 출시 / PDF 정확보정) ==========
        (() => {
          // ===== 가솔린 옵션 (1.6T / 2.0 공통) =====
          const SONATA_GASOLINE_OPTIONS = {
            builtin_cam: { name: "빌트인 캠 2 + 증강현실 내비", sub: "주행/주차 녹화 (내비게이션 선택 시 가능)", price: 45 },
            navi_1: { name: "인포테인먼트 내비 Ⅰ", sub: "12.3\"내비+파노라믹 커브드+12.3\"클러스터+HDA+NSCC+듀얼풀오토+레인센서+무드램프", price: 140 },
            parking_assist_1: { name: "└ 파킹 어시스트 Ⅰ", sub: "HUD+SVM+BVM+RSPA+RPCA+측방경고+가죽 크래시패드 (※내비 선택 시)", price: 168, requires: ["navi_1"] },
            smart_sense_1: { name: "현대 스마트센스 Ⅰ", sub: "BCA(주행)+BCA(전진출차)+RCCA+안전 하차 보조", price: 45 },
            comfort_1: { name: "컴포트 Ⅰ (1열 편의)", sub: "1열 통풍+자세메모리+동승석 4way 전동(릴렉션/워크인)", price: 64 },
            comfort_2: { name: "컴포트 Ⅱ (2열 편의)", sub: "2열 열선+커튼+RCA+6:4폴딩+암레스트", price: 67 },
            exterior_design_1: { name: "익스테리어 디자인 Ⅰ", sub: "18\"피렐리+Full LED 프로젝션+다이내믹웰컴+순차점등(앞)", price: 64 },
            hipass: { name: "하이패스", price: 20 },
            platinum_1: { name: "플래티넘 Ⅰ", sub: "HUD+디지털키2+지문인증+터치 도어핸들+가죽 크래시패드", price: 130 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 119 },
            bose: { name: "BOSE 프리미엄 사운드", sub: "12스피커+외장앰프", price: 64 }
          };

          // ===== HEV 옵션 (내비Ⅱ 사용, exterior_design_3 추가) =====
          const SONATA_HEV_OPTIONS = { ...SONATA_GASOLINE_OPTIONS };
          delete SONATA_HEV_OPTIONS.navi_1;
          SONATA_HEV_OPTIONS.navi_2 = { name: "인포테인먼트 내비 Ⅱ", sub: "12.3\"내비+파노라믹 커브드+12.3\"클러스터+HDA+NSCC+무드램프 (HEV 전용)", price: 106 };
          SONATA_HEV_OPTIONS.parking_assist_1 = { name: "└ 파킹 어시스트 Ⅰ", sub: "HUD+SVM+BVM+RSPA+RPCA+측방경고 (※내비Ⅱ 선택 시)", price: 168, requires: ["navi_2"] };
          SONATA_HEV_OPTIONS.exterior_design_3 = { name: "익스테리어 디자인 Ⅲ", sub: "17\"+Full LED 프로젝션+다이내믹웰컴+순차점등 (HEV 프리미엄/S용)", price: 40 };

          // ===== LPG 일반 옵션 =====
          const SONATA_LPG_OPTIONS = {
            builtin_cam: { name: "빌트인 캠 2 + 증강현실 내비", price: 45 },
            navi_1: { name: "인포테인먼트 내비 Ⅰ", sub: "12.3\"내비+파노라믹 커브드+12.3\"클러스터+HDA+NSCC", price: 140 },
            parking_assist_2: { name: "└ 파킹 어시스트 Ⅱ", sub: "HUD+SVM+BVM+RPCA+측방경고 (LPG: RSPA 미적용)", price: 138, requires: ["navi_1"] },
            smart_sense_1: { name: "현대 스마트센스 Ⅰ", price: 45 },
            comfort_1: { name: "컴포트 Ⅰ (1열 편의)", price: 64 },
            comfort_3: { name: "컴포트 Ⅲ (2열·LPG)", sub: "2열 열선+커튼+RCA+암레스트(스키쓰루) ※봄베로 6:4폴딩 미적용", price: 57 },
            exterior_design_2: { name: "익스테리어 디자인 Ⅱ", sub: "18\"알로이+Full LED 프로젝션+다이내믹웰컴+순차점등 (LPG: 피렐리 미적용)", price: 45 },
            hipass: { name: "하이패스", price: 20 },
            platinum_1: { name: "플래티넘 Ⅰ", price: 130 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 119 },
            bose: { name: "BOSE 프리미엄 사운드", price: 64 }
          };

          // ===== LPG 렌터카 (Business 1/2) =====
          const SONATA_LPG_RENT_OPTIONS = {
            // Business 1/2 공통
            smart_sense_2: { name: "현대 스마트센스 Ⅱ", sub: "FCA(교차/정면)+SCC+BCA(주행/전진출차)+RCCA+안전 하차 보조 (※내비 적용 시 HDA/NSCC 포함)", price: 73 },
            // Business 1 전용
            navi_3: { name: "인포테인먼트 내비 Ⅲ", sub: "12.3\"내비+파노라믹 커브드+12.3\"클러스터+듀얼풀오토+레인센서+무드램프", price: 130 },
            comfort_1: { name: "컴포트 Ⅰ (1열 편의·렌터카)", price: 61 },
            exterior_design_3: { name: "익스테리어 디자인 Ⅲ", sub: "17\"+Full LED 프로젝션+다이내믹웰컴+순차점등 (렌터카)", price: 38 },
            hipass_ecm: { name: "하이패스 + ECM 룸미러", price: 23 },
            // Business 2 전용
            platinum_2: { name: "플래티넘 Ⅱ", sub: "무선충전+디지털키2+지문인증+터치 도어핸들+BOSE 12스피커", price: 117 },
            comfort_3: { name: "컴포트 Ⅲ (2열 편의)", price: 54 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 113 },
            builtin_cam: { name: "빌트인 캠 2 + 증강현실 내비", price: 42 }
          };

          // ===== N라인 옵션 =====
          const SONATA_NLINE_OPTIONS = {
            turbo_2_5_perf: { name: "2.5 터보 퍼포먼스", sub: "G 2.5 T-GDI+8단 습식DCT+N파워시프트+레브매칭+듀얼트윈팁+ASD ※2.5 터보는 RSPA/ISG 미적용", price: 200 },
            builtin_cam: { name: "빌트인 캠 2 + 증강현실 내비", price: 45 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 119 },
            parking_assist_1: { name: "파킹 어시스트 Ⅰ (1.6 터보 전용)", sub: "원격주차+HUD+SVM+BVM+RPCA+측방경고+가죽 크래시패드", price: 168 },
            parking_assist_2: { name: "파킹 어시스트 Ⅱ (2.5 터보 적용 시)", sub: "HUD+SVM+BVM+RPCA+측방경고 (RSPA 미적용)", price: 138, requires: ["turbo_2_5_perf"] },
            comfort_4: { name: "컴포트 Ⅳ (2열 편의)", sub: "2열 열선+커튼+RCA+6:4폴딩", price: 64 }
          };

          // ===== 트림 표준사양 =====
          const PREMIUM_F = ["스마트스트림 G 1.6 T-GDI / G 2.0 / LPG 2.0", "8단 자동(1.6T) / 6단 자동(2.0/LPG)", "ISG", "R-MDPS(1.6T) / MDPS", "전자식 변속 칼럼", "통합 주행 모드", "후륜 멀티링크", "9에어백+전복커튼", "FCA(차량/보행자/자전거/교차로/정면)", "LKA/LFA/HBA/DAW/ISLA", "SCC(스탑앤고)", "전방차량 출발 알림", "진동경고 스티어링", "심리스 호라이즌 LED", "Full LED MFR 헤드", "LED 방향(뒤)+리어콤비+보조제동", "도어 포켓 라이팅(1열)", "17\" 알로이", "크롬 DLO몰딩", "펜더 LED 방향", "이중접합 차음(윈드/1열)", "4.2\" 클러스터", "가죽스티어링(열선)", "인조가죽 도어센터", "LED 실내등", "ECM 룸미러", "인조가죽 시트", "1열 열선시트", "운전석 8way 전동(럼버)", "시트백 포켓", "버튼시동/스마트키", "원격시동", "스마트 트렁크", "EPB(오토홀드)", "매뉴얼 에어컨(애프터블로우)", "세이프티 파워 윈도우(전좌석)", "2열 에어벤트", "후방 모니터", "전방/후방 주차 거리경고", "패들쉬프트", "오토라이트", "마이크로 에어필터", "USB C타입(1/2열)", "12.3\" 디스플레이오디오(블루링크/폰프로젝션)", "6스피커", "OTA"];
          const S_F = ["+HDA", "NSCC", "BCA(주행)/BCA(전진출차)/RCCA", "안전 하차 보조", "파노라믹 커브드 디스플레이", "12.3\" 클러스터", "1열 통풍시트", "듀얼 풀오토 에어컨", "운전석 공조 연동", "레인센서", "하이패스", "12.3\" 내비(인카페이먼트/e hi-pass)"];
          const EXCLUSIVE_F = ["+RPCA", "앰비언트 무드램프", "크롬 인사이드 도어핸들", "멜란지 니트 내장재(헤드라이닝/필라)", "천연가죽 시트", "운전석 자세메모리", "동승석 4way 전동(릴렉션/워크인)", "스마트 파워트렁크", "스마트폰 무선충전", "RSPA", "SVM", "BVM", "측방 주차거리 경고"];
          const INSPIRATION_F = ["+2열 승객 알림", "Full LED 프로젝션 헤드", "다이내믹 웰컴", "순차점등 방향(앞)", "18\" 알로이(피렐리/1.6T·2.0)", "자외선 차단유리(윈드)", "터치 도어핸들", "인조가죽 크래시패드", "메탈 페달", "나파가죽 시트(카멜/그레이지/네이비)", "2열 열선시트", "2열 6:4 분할 폴딩", "2열 암레스트", "HUD", "2열 수동 도어커튼", "뒷면 전동커튼", "디지털키2", "실내 지문인증"];
          const LPG_PREMIUM_F = ["스마트스트림 LPG 2.0", "6단 자동", "MDPS", "전자식 변속 칼럼", "통합 주행 모드", "후륜 멀티링크", "원형 봄베", "9에어백+전복커튼", "FCA(차량/보행자/자전거/교차로/정면)", "LKA/LFA/HBA/DAW", "SCC(스탑앤고)", "심리스 호라이즌 LED", "Full LED MFR 헤드", "17\" 알로이", "4.2\" 클러스터", "가죽스티어링(열선)", "인조가죽 시트", "1열 열선시트", "운전석 8way 전동", "매뉴얼 에어컨", "후방 모니터", "12.3\" 디스플레이오디오", "6스피커"];
          const LPG_EXCLUSIVE_F = ["+HDA", "NSCC", "BCA/RCCA", "안전 하차 보조", "RPCA", "파노라믹 커브드", "12.3\" 클러스터", "앰비언트 무드램프", "크롬 인사이드 도어핸들", "멜란지 니트 내장재", "천연가죽 시트", "1열 통풍", "운전석 자세메모리", "동승석 전동시트(릴렉션/워크인)", "스마트 파워트렁크", "스마트폰 무선충전", "SVM/BVM/측방경고", "하이패스", "12.3\" 내비"];
          const LPG_INSPIRATION_F = ["+2열 승객 알림", "Full LED 프로젝션", "다이내믹 웰컴", "순차점등", "18\" 알로이 (피렐리 미적용)", "터치 도어핸들", "메탈 페달", "나파가죽 시트", "2열 열선", "2열 암레스트(스키쓰루)", "HUD", "디지털키2", "지문인증"];
          const HEV_PREMIUM_F = ["스마트스트림 가솔린 2.0 하이브리드", "6단 자동", "하이브리드 시스템(구동모터/파워컨트롤/회생제동)", "e-Motion Drive(e-Dynamic/e-Comfort)", "MDPS", "후륜 멀티링크", "9에어백+전복커튼", "FCA(차량/보행자/자전거/교차로/정면)", "LKA/LFA/HBA/DAW", "SCC", "심리스 호라이즌 LED", "Full LED MFR 헤드", "16\" 알로이", "4.2\" 클러스터", "가죽스티어링(열선)", "인조가죽 시트", "1열 열선", "운전석 8way 전동", "듀얼풀오토 에어컨(기본)", "레인센서(기본)", "후방 모니터", "12.3\" 디스플레이오디오"];
          const RENT_B1_F = ["스마트스트림 LPG 2.0", "6단 자동(수동겸용·부츠타입)", "MDPS", "원형 봄베", "9에어백", "FCA(차량/보행자/자전거)", "LKA/LFA/HBA/DAW", "16\" 알로이", "Full LED MFR 헤드", "가죽스티어링(열선)", "가죽 변속노브", "인조가죽 시트", "1열 열선/통풍", "운전석 8way 전동(럼버)", "매뉴얼 에어컨", "12.3\" 디스플레이오디오"];
          const RENT_B2_F = ["+전자식 변속 칼럼", "Full LED 프로젝션", "다이내믹 웰컴", "순차점등", "17\" 알로이", "파노라믹 커브드", "12.3\" 클러스터", "앰비언트 무드램프", "크롬 인사이드 도어핸들", "멜란지 니트 내장재", "천연가죽 시트", "1열 통풍", "운전석 자세메모리", "동승석 전동시트", "스마트 파워트렁크", "ECM 룸미러", "하이패스", "듀얼풀오토 에어컨", "12.3\" 내비"];
          const NLINE_F = ["N라인 전용 외관(블랙 하이그로시 그릴/프론트·리어 범퍼/에어 인테이크/블랙 투톤 도어핸들/리어 스포일러/듀얼 트윈팁/N 휠캡)", "심리스 호라이즌 LED", "Full LED 프로젝션", "다이내믹 웰컴", "순차점등(앞)", "펜더 LED 방향", "Full LED 리어콤비", "19\" 알로이(피렐리)", "터치 도어핸들", "자외선 차단유리(윈드)", "파노라믹 커브드", "12.3\" 클러스터", "ECM 룸미러", "크롬 인사이드 도어핸들", "메탈 페달", "다크 그레이 니트 내장재", "앰비언트 무드램프", "스웨이드+나파가죽 버킷시트(1열)", "운전석 8way 전동(럼버+볼스터+IMS)", "동승석 4way 전동(릴렉션/워크인)", "1열 열선/통풍", "2열 암레스트", "EPB", "듀얼풀오토 에어컨", "FCA(교차/정면)", "LKA/LFA/HBA/DAW", "BCA/RCCA/SEW", "안전 하차 보조", "HDA/SCC/NSCC", "12.3\" 내비", "BOSE 12스피커", "디지털키2", "실내 지문인증", "무선충전", "하이패스"];
          
          return {
            model_id: "sonata",
            model_name: "쏘나타 디 엣지",
            category: "중형 세단",
            year: 2026,
            variants: [
              // 가솔린 1.6 터보 (4트림)
              {
                variant_id: "gasoline_1_6t",
                variant_name: "가솔린 1.6 터보",
                vehicle_type: "승용",
                fuel: "가솔린",
                displacement_cc: 1598,
                transmission: "자동 8단",
                trims: [
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 2937, base_price_3_5: 2892,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 13.5, urban: 11.9, highway: 15.9, co2: 123 },
                    standard_features: PREMIUM_F,
                    available_options: ["builtin_cam", "navi_1", "parking_assist_1", "smart_sense_1", "comfort_1", "comfort_2", "exterior_design_1", "hipass"] },
                  { trim_id: "s", name: "S", seats: 5,
                    base_price_5: 3069, base_price_3_5: 3022,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 13.5, urban: 11.9, highway: 15.9, co2: 123 },
                    standard_features: S_F,
                    available_options: ["builtin_cam", "parking_assist_1", "exterior_design_1"] },
                  { trim_id: "exclusive", name: "익스클루시브", seats: 5,
                    base_price_5: 3377, base_price_3_5: 3326,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 13.5, urban: 11.9, highway: 15.9, co2: 123 },
                    standard_features: EXCLUSIVE_F,
                    available_options: ["builtin_cam", "platinum_1", "comfort_2", "exterior_design_1", "panoramic_sunroof"] },
                  { trim_id: "inspiration", name: "인스퍼레이션", seats: 5,
                    base_price_5: 3671, base_price_3_5: 3615,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 13.0, urban: 11.4, highway: 15.5, co2: 128 },
                    standard_features: INSPIRATION_F,
                    available_options: ["builtin_cam", "panoramic_sunroof", "bose"] }
                ],
                options_master: SONATA_GASOLINE_OPTIONS
              },
              // 가솔린 2.0 (4트림)
              {
                variant_id: "gasoline_2_0",
                variant_name: "가솔린 2.0",
                vehicle_type: "승용",
                fuel: "가솔린",
                displacement_cc: 1999,
                transmission: "자동 6단",
                trims: [
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 2870, base_price_3_5: 2826,
                    engine: "스마트스트림 G 2.0",
                    fuel_economy: { combined: 12.6, urban: 11.2, highway: 14.8, co2: 132 },
                    standard_features: PREMIUM_F,
                    available_options: ["builtin_cam", "navi_1", "parking_assist_1", "smart_sense_1", "comfort_1", "comfort_2", "exterior_design_1", "hipass"] },
                  { trim_id: "s", name: "S", seats: 5,
                    base_price_5: 3002, base_price_3_5: 2956,
                    engine: "스마트스트림 G 2.0",
                    fuel_economy: { combined: 12.6, urban: 11.2, highway: 14.8, co2: 132 },
                    standard_features: S_F,
                    available_options: ["builtin_cam", "parking_assist_1", "exterior_design_1"] },
                  { trim_id: "exclusive", name: "익스클루시브", seats: 5,
                    base_price_5: 3310, base_price_3_5: 3260,
                    engine: "스마트스트림 G 2.0",
                    fuel_economy: { combined: 12.6, urban: 11.2, highway: 14.8, co2: 132 },
                    standard_features: EXCLUSIVE_F,
                    available_options: ["builtin_cam", "platinum_1", "comfort_2", "exterior_design_1", "panoramic_sunroof"] },
                  { trim_id: "inspiration", name: "인스퍼레이션", seats: 5,
                    base_price_5: 3604, base_price_3_5: 3549,
                    engine: "스마트스트림 G 2.0",
                    fuel_economy: { combined: 12.0, urban: 10.7, highway: 14.1, co2: 139 },
                    standard_features: INSPIRATION_F,
                    available_options: ["builtin_cam", "panoramic_sunroof", "bose"] }
                ],
                options_master: SONATA_GASOLINE_OPTIONS
              },
              // 하이브리드 2.0 (4트림 - PDF 세제혜택 후 가격)
              {
                variant_id: "hybrid_2_0",
                variant_name: "하이브리드 2.0",
                vehicle_type: "승용 (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1999,
                transmission: "자동 6단",
                trims: [
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 3422, base_price_3_5: 3368,
                    engine: "스마트스트림 HEV 2.0 (시스템+구동모터)",
                    fuel_economy: { combined: 19.4, urban: 19.8, highway: 18.9, co2: 81 },
                    standard_features: HEV_PREMIUM_F,
                    available_options: ["builtin_cam", "navi_2", "parking_assist_1", "smart_sense_1", "comfort_1", "comfort_2", "exterior_design_3", "hipass"] },
                  { trim_id: "s", name: "S", seats: 5,
                    base_price_5: 3524, base_price_3_5: 3469,
                    engine: "스마트스트림 HEV 2.0",
                    fuel_economy: { combined: 17.8, urban: 18.0, highway: 17.6, co2: 89 },
                    standard_features: ["+HDA", "NSCC", "BCA/RCCA", "안전 하차 보조", "파노라믹 커브드", "12.3\" 클러스터", "1열 통풍시트", "운전석 공조 연동", "하이패스", "12.3\" 내비"],
                    available_options: ["builtin_cam", "parking_assist_1", "exterior_design_3"] },
                  { trim_id: "exclusive", name: "익스클루시브", seats: 5,
                    base_price_5: 3832, base_price_3_5: 3772,
                    engine: "스마트스트림 HEV 2.0",
                    fuel_economy: { combined: 17.8, urban: 18.0, highway: 17.6, co2: 89 },
                    standard_features: ["+RPCA", "17\" 알로이", "앰비언트 무드램프", "크롬 인사이드 도어핸들", "멜란지 니트 내장재", "천연가죽 시트", "운전석 자세메모리", "동승석 전동시트(릴렉션/워크인)", "스마트 파워트렁크", "스마트폰 무선충전", "RSPA/SVM/BVM/측방경고"],
                    available_options: ["builtin_cam", "platinum_1", "comfort_2", "exterior_design_1", "panoramic_sunroof"] },
                  { trim_id: "inspiration", name: "인스퍼레이션", seats: 5,
                    base_price_5: 4142, base_price_3_5: 4077,
                    engine: "스마트스트림 HEV 2.0",
                    fuel_economy: { combined: 17.1, urban: 16.8, highway: 17.4, co2: 93 },
                    standard_features: INSPIRATION_F,
                    available_options: ["builtin_cam", "panoramic_sunroof", "bose"] }
                ],
                options_master: SONATA_HEV_OPTIONS
              },
              // LPG 2.0 (일반판매, 3트림 - S 없음)
              {
                variant_id: "lpg_2_0",
                variant_name: "LPG 2.0 (일반판매)",
                vehicle_type: "승용",
                fuel: "LPG",
                displacement_cc: 1999,
                transmission: "자동 6단",
                trims: [
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 2955, base_price_3_5: 2910,
                    engine: "스마트스트림 LPG 2.0",
                    fuel_economy: { combined: 9.7, urban: 8.4, highway: 12.0, co2: 134 },
                    standard_features: LPG_PREMIUM_F,
                    available_options: ["builtin_cam", "navi_1", "parking_assist_2", "smart_sense_1", "comfort_1", "comfort_3", "exterior_design_2", "hipass"] },
                  { trim_id: "exclusive", name: "익스클루시브", seats: 5,
                    base_price_5: 3360, base_price_3_5: 3309,
                    engine: "스마트스트림 LPG 2.0",
                    fuel_economy: { combined: 9.7, urban: 8.4, highway: 12.0, co2: 134 },
                    standard_features: LPG_EXCLUSIVE_F,
                    available_options: ["builtin_cam", "platinum_1", "comfort_3", "exterior_design_2", "panoramic_sunroof"] },
                  { trim_id: "inspiration", name: "인스퍼레이션", seats: 5,
                    base_price_5: 3629, base_price_3_5: 3574,
                    engine: "스마트스트림 LPG 2.0",
                    fuel_economy: { combined: 9.4, urban: 8.2, highway: 11.5, co2: 138 },
                    standard_features: LPG_INSPIRATION_F,
                    available_options: ["builtin_cam", "panoramic_sunroof", "bose"] }
                ],
                options_master: SONATA_LPG_OPTIONS
              },
              // LPG 2.0 (렌터카, 2트림 - 부가세 포함 면세가)
              {
                variant_id: "lpg_2_0_rent",
                variant_name: "LPG 2.0 (렌터카)",
                vehicle_type: "승용 (렌터카 면세)",
                fuel: "LPG",
                displacement_cc: 1999,
                transmission: "자동 6단",
                trims: [
                  { trim_id: "business_1", name: "Business 1", seats: 5,
                    base_price_5: 2560, base_price_3_5: 2560,
                    engine: "스마트스트림 LPG 2.0",
                    fuel_economy: { combined: 9.6, urban: 8.3, highway: 11.7, co2: 136 },
                    standard_features: RENT_B1_F,
                    available_options: ["smart_sense_2", "navi_3", "comfort_1", "exterior_design_3", "hipass_ecm"] },
                  { trim_id: "business_2", name: "Business 2", seats: 5,
                    base_price_5: 2984, base_price_3_5: 2984,
                    engine: "스마트스트림 LPG 2.0",
                    fuel_economy: { combined: 9.7, urban: 8.4, highway: 12.0, co2: 134 },
                    standard_features: RENT_B2_F,
                    available_options: ["smart_sense_2", "platinum_2", "comfort_3", "panoramic_sunroof", "builtin_cam"] }
                ],
                options_master: SONATA_LPG_RENT_OPTIONS
              },
              // N라인 (1트림, 1.6T 기본 / 2.5T 옵션)
              {
                variant_id: "n_line",
                variant_name: "N 라인 (1.6T / 2.5T 선택)",
                vehicle_type: "승용 (고성능)",
                fuel: "가솔린",
                displacement_cc: 1598,
                transmission: "자동 8단 / 8단 습식 DCT(2.5T 옵션)",
                trims: [
                  { trim_id: "n_line", name: "N 라인", seats: 5,
                    base_price_5: 3731, base_price_3_5: 3674,
                    engine: "G 1.6 T-GDI (기본) / G 2.5 T-GDI (옵션)",
                    fuel_economy: { combined: 12.0, urban: 10.4, highway: 14.9, co2: 138 },
                    standard_features: NLINE_F,
                    available_options: ["turbo_2_5_perf", "builtin_cam", "panoramic_sunroof", "parking_assist_1", "parking_assist_2", "comfort_4"] }
                ],
                options_master: SONATA_NLINE_OPTIONS,
                exclusive_groups: [
                  { id: "parking_assist", label: "파킹 어시스트 (엔진별 상이)", members: ["parking_assist_1", "parking_assist_2"] }
                ]
              }
            ],
            exterior_colors: [
              { name: "세레니티 화이트 펄", code: "W6H", hex: "#f4f4f0", price: 8 },
              { name: "트랜스미션 블루 펄", code: "NY9", hex: "#5a7a9c", price: 0 },
              { name: "바이오 필릭 블루 펄", code: "XB9", hex: "#1a3a5a", price: 0 },
              { name: "어비스 블랙 펄", code: "A2B", hex: "#1a1a1a", price: 0 },
              { name: "얼티메이트 레드 메탈릭", code: "R2P", hex: "#8a2020", price: 0 },
              { name: "녹턴 그레이 메탈릭", code: "T2G", hex: "#5d5e5f", price: 0 },
              { name: "녹턴 그레이 매트(무광)", code: "T9M", hex: "#4a4a4b", price: 20 },
              { name: "에어로 실버 매트(무광)", code: "T4M", hex: "#b8bcc0", price: 20 }
            ]
          };
        })(),
        
        // ========== 그랜저 (페이스리프트 - 2026.5.14 출시) ==========
        (() => {
          const GRANDEUR_GAS_OPTIONS = {
            engine_3_5: { name: "스마트스트림 가솔린 3.5 엔진", sub: "T-GDI 3.5 V6 (가솔린 2.5 → 3.5 변경)", price: 247 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 120 },
            htrac: { name: "HTRAC (4WD)", sub: "스마트스트림 가솔린 3.5 선택 시만 가능", price: 220,
              requires: ["engine_3_5"] },
            builtin_cam2_plus: { name: "빌트인 캠 2 Plus", sub: "음성녹음+주행/주차 20시간 녹화", price: 65 },
            smart_sense_1: { name: "현대 스마트센스 Ⅰ", sub: "후측방 충돌경고/충돌방지(전진)+후방교차+안전하차+1열 모니터링", price: 140 },
            parking_assist: { name: "파킹 어시스트", sub: "SVM(투명)+RPCA+BVM+RSPA+측방경고+기억후진", price: 170 },
            premium_choice: { name: "프리미엄 초이스", sub: "디지털키2+천연가죽퀼팅+스마트파워트렁크+듀얼 무선충전(맥세이프)", price: 120 },
            platinum: { name: "플래티넘", sub: "인터랙티브 무드램프+19\"휠+프리뷰 서스펜션+HUD", price: 205 },
            smart_sense_2: { name: "현대 스마트센스 Ⅱ", sub: "FCA(교차/추월/측방/회피)+HDA2+어린이감지+BCA(주행)+1열 모니터링", price: 140 },
            seat_comfort_1: { name: "시트 컴포트 Ⅰ", sub: "2열 리클라이닝/통풍+동승석 에르고모션", price: 120 },
            bose_pkg: { name: "BOSE 프리미엄 사운드 패키지", sub: "BOSE 14스피커+ARNC+2열 고급형 암레스트", price: 120 },
            wheel_20: { name: "20\" 알로이 휠 & 타이어", sub: "플래티넘 선택 시만 가능", price: 25,
              requires: ["platinum"] },
            wheel_20_calli: { name: "20\" 알로이 휠 & 타이어 (캘리그래피)", sub: "캘리 전용 휠+피렐리 타이어", price: 45 },
            seat_comfort_plus: { name: "시트 컴포트 플러스", sub: "2열 리클라이닝+전동 도어커튼+동승석 에르고모션+양문형 콘솔(열선)", price: 150 },
            smart_vision_roof: { name: "스마트 비전 루프", sub: "파노라마 선루프 중복 선택 불가", price: 180 }
          };
          const GRANDEUR_LPG_OPTIONS = {
            panoramic_sunroof: { name: "파노라마 선루프", price: 120 },
            builtin_cam2_plus: { name: "빌트인 캠 2 Plus", price: 65 },
            smart_sense_1: { name: "현대 스마트센스 Ⅰ", sub: "후측방 충돌경고/충돌방지(전진)+후방교차+안전하차+1열 모니터링", price: 140 },
            parking_assist: { name: "파킹 어시스트", sub: "SVM(투명)+RPCA+BVM+RSPA+측방경고+기억후진", price: 170 },
            premium_choice: { name: "프리미엄 초이스", sub: "디지털키2+천연가죽퀼팅+스마트파워트렁크+듀얼 무선충전", price: 120 },
            platinum_lpg: { name: "플래티넘 (LPG 3.5)", sub: "인터랙티브 무드램프+19\"휠+2열 통풍+HUD", price: 165 },
            smart_sense_2: { name: "현대 스마트센스 Ⅱ", sub: "FCA(교차/추월/측방/회피)+HDA2+어린이감지+BCA(주행)+1열 모니터링", price: 140 },
            bose_pkg: { name: "BOSE 프리미엄 사운드 패키지", sub: "BOSE 14스피커+ARNC+2열 고급형 암레스트", price: 120 }
          };
          const GRANDEUR_HEV_OPTIONS = {
            panoramic_sunroof: { name: "파노라마 선루프", price: 120 },
            builtin_cam2_plus: { name: "빌트인 캠 2 Plus", sub: "음성녹음+주행/주차 20시간 녹화", price: 65 },
            smart_sense_1: { name: "현대 스마트센스 Ⅰ", sub: "후측방 충돌경고/충돌방지(전진)+후방교차+안전하차+1열 모니터링", price: 140 },
            parking_assist: { name: "파킹 어시스트", sub: "SVM(투명)+RPCA+BVM+RSPA+측방경고+기억후진", price: 170 },
            premium_choice: { name: "프리미엄 초이스", sub: "디지털키2+천연가죽퀼팅+스마트파워트렁크+듀얼 무선충전(맥세이프)", price: 120 },
            platinum: { name: "플래티넘", sub: "인터랙티브 무드램프+19\"휠+프리뷰 서스펜션+HUD", price: 205 },
            smart_sense_2: { name: "현대 스마트센스 Ⅱ", sub: "FCA(교차/추월/측방/회피)+HDA2+어린이감지+BCA(주행)+1열 모니터링", price: 140 },
            seat_comfort_2: { name: "시트 컴포트 Ⅱ", sub: "2열 리클라이닝/통풍+동승석 에르고모션+빌트인 캠 2 Plus ※빌트인 캠 중복 불가", price: 185 },
            bose_pkg: { name: "BOSE 프리미엄 사운드 패키지", sub: "BOSE 14스피커+ARNC+2열 고급형 암레스트", price: 120 },
            wheel_20: { name: "20\" 알로이 휠 & 타이어", sub: "플래티넘 선택 시만 가능", price: 25,
              requires: ["platinum"] },
            wheel_20_calli: { name: "20\" 알로이 휠 & 타이어 (캘리그래피)", sub: "캘리 전용 휠+피렐리 타이어", price: 45 },
            seat_comfort_plus: { name: "시트 컴포트 플러스", sub: "2열 리클라이닝+전동 도어커튼+동승석 에르고모션+양문형 콘솔(열선)", price: 150 },
            smart_vision_roof: { name: "스마트 비전 루프", sub: "파노라마 선루프 중복 선택 불가", price: 180 }
          };
          const GAS_EXCLUSIVE = [
            { id: "wheel_20_grp", label: "20\" 휠", members: ["wheel_20", "wheel_20_calli"] },
            { id: "roof", label: "루프", members: ["panoramic_sunroof", "smart_vision_roof"] }
          ];
          
          const PREMIUM_F = ["스마트스트림 가솔린 2.5 + 8단 자동", "R-MDPS", "통합 주행모드", "전방 예측 변속", "10에어백+센터사이드+무릎+전복커튼", "다중 충돌방지 자동제동", "페달 오조작 안전보조", "FCA(차량/보행자/자전거/교차로/정면)", "LKA2/LFA/ISLA/DAW/HBA", "SCC(스탑앤고)", "NSCC(안전구간/곡선/진출입로)", "HDA", "스티어링 휠 그립 감지", "18\" 알로이 휠", "심리스 호라이즌 LED", "Full LED 헤드(멀티셀 프로젝션)", "프레임리스 도어", "오토 플러시 도어핸들", "이중접합 차음유리", "히든 안테나", "나파 엠보 가죽 스티어링(열선)", "베젤리스 인사이드 미러", "9.9\"슬림 디스플레이", "양문형 콘솔 암레스트", "인조가죽 시트", "운전석 8way 전동+동승석 4way", "1열 열선/통풍", "2열 열선", "2열 암레스트(스키쓰루)", "패들쉬프트", "EPB(오토홀드)", "스마트 트렁크", "하이패스", "C타입 USB 100W(2열 포함)", "플레오스 커넥트 17\"", "8스피커", "글레오 AI"];
          const EXCLUSIVE_F = ["+BCA/RCCA/RPCA/SEW", "후진 가이드 램프", "전동식 틸트&텔레스코픽 스티어링", "뒷면 전동 커튼", "천연가죽 퀼팅 시트", "운전석 에르고모션(16way)+동승석 8way(릴렉션)", "운전석 자세 메모리", "디지털키2", "스마트 파워트렁크", "듀얼 무선충전(맥세이프)", "SVM(투명)/BVM/RSPA/RPCA", "측방경고", "기억후진"];
          const CALLIGRAPHY_F = ["+캘리 전용 그릴+19\"휠", "프리뷰 전자제어 서스펜션", "FCA(교차/추월/측방/회피)", "HDA2", "어린이감지", "BCA(주행)", "1열 모니터링(영상회의)", "순차점등(앞/뒤)", "다이내믹 웰컴/에스코트", "발수 1열 유리", "캘리 전용 디자인(나파 엠보 스티어링+리얼우드/알루미늄+스웨이드 헤드라이닝)", "인터랙티브 앰비언트 무드", "나파가죽 퀼팅 시트", "2열 고급 암레스트(오디오)+모노포스트 헤드레스트", "2열 통풍", "3존 독립 에어컨", "HUD", "BOSE 14스피커+ARNC"];
          const BLACK_INK_F = ["+블랙 잉크 전용 디자인", "블랙 외관(그릴/범퍼/몰딩/엠블럼)", "20\" 블랙 알로이+피렐리", "블랙 내장(리얼 알루미늄+인조가죽+스웨이드)", "외장 색상: 어비스 블랙 / 세레니티 화이트 한정"];
          const LPG_PREMIUM_F = ["스마트스트림 LPG 3.5 + 8단 자동", "원형 봄베", ...PREMIUM_F.slice(1)];
          const LPG_EXCLUSIVE_F = EXCLUSIVE_F;
          
          return {
            model_id: "grandeur",
            model_name: "더 뉴 그랜저",
            category: "준대형 세단 (2026.5.14 페이스리프트)",
            year: 2026,
            variants: [
              {
                variant_id: "gasoline",
                variant_name: "가솔린 2.5/3.5",
                vehicle_type: "승용",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "자동 8단",
                trims: [
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 4250, base_price_3_5: 4185,
                    engine: "스마트스트림 G 2.5 (3.5 옵션)",
                    fuel_economy: { combined: 11.6, urban: 9.9, highway: 14.9, co2: 143 },
                    standard_features: PREMIUM_F,
                    available_options: ["engine_3_5", "panoramic_sunroof", "htrac", "builtin_cam2_plus", "smart_sense_1", "parking_assist", "premium_choice"] },
                  { trim_id: "exclusive", name: "익스클루시브", seats: 5,
                    base_price_5: 4700, base_price_3_5: 4629,
                    engine: "스마트스트림 G 2.5 (3.5 옵션)",
                    fuel_economy: { combined: 11.2, urban: 9.4, highway: 14.5, co2: 149 },
                    standard_features: EXCLUSIVE_F,
                    available_options: ["engine_3_5", "panoramic_sunroof", "htrac", "builtin_cam2_plus", "platinum", "smart_sense_2", "seat_comfort_1", "bose_pkg", "wheel_20"] },
                  { trim_id: "calligraphy", name: "캘리그래피", seats: 5,
                    base_price_5: 5317, base_price_3_5: 5236,
                    engine: "스마트스트림 G 2.5 (3.5 옵션)",
                    fuel_economy: { combined: 11.0, urban: 9.4, highway: 14.1, co2: 151 },
                    standard_features: CALLIGRAPHY_F,
                    available_options: ["engine_3_5", "panoramic_sunroof", "htrac", "builtin_cam2_plus", "wheel_20_calli", "seat_comfort_plus", "smart_vision_roof"] },
                  { trim_id: "black_ink", name: "블랙 잉크", seats: 5,
                    base_price_5: 5407, base_price_3_5: 5325,
                    engine: "스마트스트림 G 2.5 (3.5 옵션)",
                    fuel_economy: { combined: 11.0, urban: 9.4, highway: 14.1, co2: 151 },
                    standard_features: [...CALLIGRAPHY_F, ...BLACK_INK_F],
                    available_options: ["engine_3_5", "panoramic_sunroof", "htrac", "builtin_cam2_plus", "seat_comfort_plus", "smart_vision_roof"] }
                ],
                options_master: GRANDEUR_GAS_OPTIONS,
                exclusive_groups: GAS_EXCLUSIVE
              },
              {
                variant_id: "lpg_3_5",
                variant_name: "LPG 3.5",
                vehicle_type: "승용",
                fuel: "LPG",
                displacement_cc: 3470,
                transmission: "자동 8단",
                trims: [
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 4398, base_price_3_5: 4331,
                    engine: "스마트스트림 LPG 3.5",
                    fuel_economy: { combined: 7.7, urban: 6.5, highway: 10.1, co2: 171 },
                    standard_features: LPG_PREMIUM_F,
                    available_options: ["panoramic_sunroof", "builtin_cam2_plus", "smart_sense_1", "parking_assist", "premium_choice"] },
                  { trim_id: "exclusive", name: "익스클루시브", seats: 5,
                    base_price_5: 4848, base_price_3_5: 4774,
                    engine: "스마트스트림 LPG 3.5",
                    fuel_economy: { combined: 7.4, urban: 6.3, highway: 9.4, co2: 179 },
                    standard_features: LPG_EXCLUSIVE_F,
                    available_options: ["panoramic_sunroof", "builtin_cam2_plus", "platinum_lpg", "smart_sense_2", "bose_pkg"] }
                ],
                options_master: GRANDEUR_LPG_OPTIONS
              },
              {
                variant_id: "hybrid",
                variant_name: "하이브리드 1.6T",
                vehicle_type: "승용 (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1598,
                transmission: "자동 6단",
                trims: [
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 4939, base_price_3_5: 4864,
                    engine: "스마트스트림 G 1.6 T-GDI HEV (47.7kW 모터)",
                    fuel_economy: { combined: 16.7, urban: 16.5, highway: 17.0, co2: 100, note: "환경 친화적 자동차 고시 완료 후 안내 예정 (참고값)" },
                    standard_features: ["스마트스트림 가솔린 1.6 터보 하이브리드 + 6단 자동", "하이브리드 시스템(47.7kW 모터+리튬이온 배터리+회생제동)", "e-Motion Drive(e-Dynamic/e-Comfort)", "R-MDPS", "통합 주행모드", "10에어백+센터사이드+무릎+전복커튼", "다중 충돌방지 자동제동", "페달 오조작 안전보조", "FCA(차량/보행자/자전거/교차로/정면)", "LKA2/LFA/ISLA/DAW/HBA", "SCC(스탑앤고)", "NSCC(안전구간/곡선/진출입로)", "HDA", "스티어링 휠 그립 감지", "18\" 알로이 휠", "심리스 호라이즌 LED", "Full LED 헤드(멀티셀 프로젝션)", "프레임리스 도어", "오토 플러시 도어핸들", "이중접합 차음유리", "히든 안테나", "나파 엠보 가죽 스티어링(열선)", "베젤리스 인사이드 미러", "9.9\"슬림 디스플레이", "양문형 콘솔 암레스트", "인조가죽 시트", "운전석 8way 전동+동승석 4way", "1열 열선/통풍", "2열 열선", "패들쉬프트", "EPB(오토홀드)", "스마트 트렁크", "하이패스", "C타입 USB 100W(2열 포함)", "플레오스 커넥트 17\"", "8스피커", "글레오 AI"],
                    available_options: ["panoramic_sunroof", "builtin_cam2_plus", "smart_sense_1", "parking_assist", "premium_choice"] },
                  { trim_id: "exclusive", name: "익스클루시브", seats: 5,
                    base_price_5: 5389, base_price_3_5: 5307,
                    engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 16.3, urban: 16.0, highway: 16.8, co2: 102, note: "환경 친화적 자동차 고시 완료 후 안내 예정 (참고값)" },
                    standard_features: ["+BCA/RCCA/RPCA/SEW", "후진 가이드 램프", "전동식 틸트&텔레스코픽 스티어링", "뒷면 전동 커튼", "천연가죽 퀼팅 시트", "운전석 에르고모션(16way)+동승석 8way(릴렉션)", "운전석 자세 메모리", "디지털키2", "스마트 파워트렁크", "듀얼 무선충전(맥세이프)", "SVM(투명)/BVM/RSPA/RPCA", "측방경고", "기억후진"],
                    available_options: ["panoramic_sunroof", "builtin_cam2_plus", "platinum", "smart_sense_2", "seat_comfort_2", "bose_pkg", "wheel_20"] },
                  { trim_id: "calligraphy", name: "캘리그래피", seats: 5,
                    base_price_5: 6006, base_price_3_5: 5915,
                    engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 15.7, urban: 15.4, highway: 16.2, co2: 105, note: "환경 친화적 자동차 고시 완료 후 안내 예정 (참고값)" },
                    standard_features: CALLIGRAPHY_F,
                    available_options: ["panoramic_sunroof", "builtin_cam2_plus", "wheel_20_calli", "seat_comfort_plus", "smart_vision_roof"] },
                  { trim_id: "black_ink", name: "블랙 잉크", seats: 5,
                    base_price_5: 6096, base_price_3_5: 6030,
                    engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 15.5, urban: 15.2, highway: 16.0, co2: 106, note: "환경 친화적 자동차 고시 완료 후 안내 예정 (참고값)" },
                    standard_features: [...CALLIGRAPHY_F, ...BLACK_INK_F],
                    available_options: ["panoramic_sunroof", "builtin_cam2_plus", "seat_comfort_plus", "smart_vision_roof"] }
                ],
                options_master: GRANDEUR_HEV_OPTIONS,
                exclusive_groups: [
                  { id: "wheel_20_grp", label: "20\" 휠", members: ["wheel_20", "wheel_20_calli"] },
                  { id: "roof", label: "루프", members: ["panoramic_sunroof", "smart_vision_roof"] }
                ],
                option_excludes: {
                  "seat_comfort_2": ["builtin_cam2_plus"]
                }
              }
            ],
            exterior_colors: [
              { name: "어비스 블랙 펄", code: "A2B", hex: "#1a1a1a", price: 0 },
              { name: "세레니티 화이트 펄", code: "W6H", hex: "#f5f4ee", price: 10 },
              { name: "에어로 실버 메탈릭", code: "T4A", hex: "#b2b3b4", price: 0 },
              { name: "트랜스미션 블루 펄", code: "NY9", hex: "#384660", price: 0 },
              { name: "녹턴 그레이 메탈릭", code: "T2G", hex: "#7a7a78", price: 0 },
              { name: "바이오필릭 블루 펄", code: "XB9", hex: "#3d5878", price: 0 },
              { name: "아티스널 버건디 펄", code: "WBP", hex: "#5c2a2e", price: 0 },
              { name: "트랜스미션 블루 매트(무광)", code: "M7D", hex: "#2e3a4f", price: 30 },
              { name: "녹턴 그레이 매트(무광)", code: "T9M", hex: "#5e5e5e", price: 30 },
              { name: "아티스널 버건디 매트(무광)", code: "WBM", hex: "#4d2326", price: 30 }
            ]
          };
        })(),
        
        // ========== 베뉴 ==========
        (() => {
          const VENUE_OPTIONS = {
            wheel_15_alloy: { name: "15\" 알로이 휠 & 타이어", sub: "스마트 트림 한정", price: 20 },
            hipass: { name: "하이패스", price: 20 },
            sunroof: { name: "선루프", sub: "투톤 컬러 루프 중복 불가", price: 40 },
            two_tone_roof: { name: "투톤 컬러 루프", sub: "선루프 중복 불가, 컬러 포인트(범퍼/미러/가니쉬) 적용", price: 40 },
            style: { name: "스타일", sub: "LED 리어콤비+17\"알로이+인조가죽 도어암레스트+루프랙", price: 79 },
            tech: { name: "테크", sub: "스마트폰 무선충전+디지털키 2 터치", price: 35 },
            modern_choice_1: { name: "모던 초이스 Ⅰ (렌터카 전용)", sub: "15\"알로이+가죽 스티어링(열선)+가죽 변속기 노브", price: 45 }
          };
          const VENUE_EXCLUSIVE = [
            { id: "roof", label: "루프", members: ["sunroof", "two_tone_roof"] }
          ];
          
          const VENUE_SMART_F = ["스마트스트림 G 1.6 + IVT", "통합 주행모드", "6에어백+전복커튼", "다중 충돌방지 자동제동", "FCA(차량/보행자/자전거)", "LKA/LFA/DAW/HBA", "차로 유지 보조", "15\" 스틸 휠", "크롬 라디에이터 그릴", "LED 주간주행등/포지셔닝램프", "아웃사이드 미러(열선/전동접이/락폴딩/LED방향)", "4.2\" 컬러 LCD 클러스터", "가죽 스티어링(열선)", "가죽 변속기 노브", "메탈 페인트 인사이드 도어핸들", "2단 러기지보드", "인조가죽 시트", "1열 열선시트", "운전석 수동 높이조절", "2열 6:4 폴딩", "수동식 틸트 스티어링", "주차거리경고(후방)", "오토라이트", "2WD 험로주행(스노우/샌드/머드)", "크루즈 컨트롤", "풀오토 에어컨", "버튼시동/스마트키", "원격시동", "8\"디스플레이오디오+4스피커", "후방모니터", "USB A/C 단자"];
          const VENUE_PREMIUM_F = ["+FCA(교차로 대향차)", "BCW/BCA(전진)/RCCA", "SCC(스탑앤고 미포함)", "LED 헤드램프(프로젝션)", "15\"알로이", "선바이저 조명", "1열 통풍시트", "수동식 틸트&텔레스코픽 스티어링", "하이패스", "ECM 룸미러", "세이프티 파워 윈도우(운전석)", "커버링 쉘프", "8\"내비(블루링크)", "6스피커"];
          const VENUE_FLUX_F = ["+17\"알로이", "LED 리어 콤비램프", "루프랙", "FLUX 전용 디자인(크롬 라디에이터+블랙 리어스키드+C필러 뱃지)", "인조가죽 적용 도어암레스트", "스마트폰 무선충전", "디지털키 2 터치"];
          const VENUE_RENT_F = ["스마트스트림 G 1.6 + IVT", "통합 주행모드", "6에어백+전복커튼", "FCA(차량/보행자/자전거)", "LKA/LFA/DAW/HBA", "차로 유지 보조", "15\" 스틸 휠", "LED 주간주행등/포지셔닝램프", "아웃사이드 미러(열선/전동접이/LED방향)", "4.2\" 컬러 LCD 클러스터", "메탈 페인트 인사이드 도어핸들", "2단 러기지보드", "인조가죽 시트", "1열 열선시트", "운전석 수동 높이조절", "2열 6:4 폴딩", "수동식 틸트 스티어링", "주차거리경고(후방)", "오토라이트", "2WD 험로주행(스노우/샌드/머드)", "크루즈 컨트롤", "버튼시동/스마트키 ※렌터카는 일부 사양 차이", "8\"디스플레이오디오+4스피커", "후방모니터"];
          
          return {
            model_id: "venue",
            model_name: "베뉴",
            category: "소형 SUV",
            year: 2025,
            variants: [
              {
                variant_id: "gasoline",
                variant_name: "가솔린 1.6",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 1598,
                transmission: "스마트스트림 IVT",
                trims: [
                  { trim_id: "smart", name: "스마트", seats: 5,
                    base_price_5: 1956, base_price_3_5: 1926,
                    engine: "스마트스트림 G 1.6",
                    fuel_economy: { combined: 13.3, urban: 12.4, highway: 14.7, co2: 125 },
                    standard_features: VENUE_SMART_F,
                    available_options: ["wheel_15_alloy", "hipass"] },
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 2246, base_price_3_5: 2212,
                    engine: "스마트스트림 G 1.6",
                    fuel_economy: { combined: 13.7, urban: 12.7, highway: 15.2, co2: 121 },
                    standard_features: VENUE_PREMIUM_F,
                    available_options: ["sunroof", "two_tone_roof", "style", "tech"] },
                  { trim_id: "flux", name: "FLUX (플럭스)", seats: 5,
                    base_price_5: 2423, base_price_3_5: 2386,
                    engine: "스마트스트림 G 1.6",
                    fuel_economy: { combined: 13.3, urban: 12.4, highway: 14.7, co2: 125 },
                    standard_features: VENUE_FLUX_F,
                    available_options: ["sunroof", "two_tone_roof"] }
                ],
                options_master: VENUE_OPTIONS,
                exclusive_groups: VENUE_EXCLUSIVE
              },
              {
                variant_id: "rent",
                variant_name: "렌터카 (Smart)",
                vehicle_type: "RV (렌터카)",
                fuel: "가솔린",
                displacement_cc: 1598,
                transmission: "스마트스트림 IVT",
                trims: [
                  { trim_id: "rent_smart", operating: false, name: "렌터카 스마트", seats: 5,
                    base_price_5: 1849, base_price_3_5: 1821,
                    engine: "스마트스트림 G 1.6",
                    fuel_economy: { combined: 13.7, urban: 12.7, highway: 15.2, co2: 121 },
                    standard_features: VENUE_RENT_F,
                    available_options: ["modern_choice_1", "hipass"] }
                ],
                options_master: VENUE_OPTIONS
              }
            ],
            exterior_colors: [
              { name: "아틀라스 화이트", code: "SAW", hex: "#f5f5f0", price: 0 },
              { name: "어비스 블랙 펄", code: "A2B", hex: "#1a1a1a", price: 0 },
              { name: "데님 블루 펄", code: "TN6", hex: "#2a3a5c", price: 0 },
              { name: "에코트로닉 그레이 펄", code: "PE2", hex: "#7a7a78", price: 0 },
              { name: "쉬머링 실버 메탈릭", code: "R2T", hex: "#b5b5b5", price: 0 },
              { name: "사이버 그레이 메탈릭", code: "C5G", hex: "#4a4a4a", price: 0 },
              { name: "미라지 그린", code: "RRR", hex: "#5a7050", price: 0 }
            ]
          };
        })(),
        
        // ========== 2027 코나 (26.4.7 출시 / PDF 정확보정) ==========
        (() => {
          // 옵션 마스터 (PDF 명시값)
          const KONA_OPTIONS = {
            // 모던 가솔린 전용
            navi_pkg_1: { name: "내비게이션 패키지 Ⅰ", sub: "12.3\"내비+e hi-pass (가솔린 모던용)", price: 55 },
            // 모던 HEV 전용
            navi_pkg_2: { name: "내비게이션 패키지 Ⅱ", sub: "12.3\"내비+e hi-pass+ECM 룸미러+레인센서 (HEV 모던용)", price: 30 },
            // 모던 공통
            smart_sense_1: { name: "현대 스마트센스 Ⅰ", sub: "진동경고휠+FCA(교차/정면)+BCA/RCCA/SEW+안전 하차 경고+HDA+SCC+NSCC", price: 110 },
            comfort_choice: { name: "컴포트 초이스", sub: "인조가죽 시트+인조가죽 도어/오픈트레이+LED 실내등", price: 40 },
            // 모던/H-Pick 공통
            hipass: { name: "하이패스", price: 20 },
            // H-Pick / Premium 공통
            best_selection: { name: "베스트 셀렉션", sub: "현대 스마트센스 Ⅲ + 클러스터 12.3\" 묶음 할인", price: 79 },
            smart_sense_3: { name: "현대 스마트센스 Ⅲ", sub: "진동경고휠+FCA(교차/정면)+HDA+SCC+NSCC", price: 55 },
            cluster_123: { name: "클러스터 12.3\" 컬러 LCD", price: 40 },
            parking_assist: { name: "└ 파킹어시스트", sub: "SVM+BVM+측방경고+RPCA+RSPA (※클러스터 선택 시)", price: 99, requires: ["cluster_123"] },
            convenience: { name: "컨비니언스", sub: "스마트 파워테일게이트+스마트폰 무선충전", price: 40 },
            builtin_cam: { name: "빌트인 캠 2 + 증강현실 내비", price: 45 },
            // H-Pick 가솔린 전용
            style_lite: { name: "스타일 Lite", sub: "Full LED 프로젝션+LED 방향(앞/뒤)+무드램프 (H-Pick 가솔린용)", price: 49 },
            // H-Pick HEV 전용 (18휠 포함)
            style_1: { name: "스타일 Ⅰ", sub: "Full LED 프로젝션+LED 방향+18\"휠+무드램프 (H-Pick HEV용)", price: 64 },
            // Premium 전용
            seat_plus: { name: "시트플러스", sub: "운전석 메모리+동승석 8way 전동(릴렉션/워크인)+2열 열선", price: 49 },
            wheel_19_gas: { name: "19\" 알로이 휠 & 타이어", sub: "프리미엄 가솔린용", price: 25 },
            wheel_18_hev: { name: "18\" 알로이 휠 & 타이어", sub: "프리미엄 HEV용", price: 25 },
            color_pkg: { name: "실내 컬러 패키지", sub: "세이지 그린 / 베이지 (블랙 익스테리어 불가)", price: 20 },
            // Inspiration / N Line 공통
            bose: { name: "BOSE 프리미엄 사운드", sub: "8스피커+외장앰프", price: 59 },
            two_tone_roof: { name: "투톤 컬러 루프", sub: "와이드 선루프 중복 불가 / 블랙 익스테리어 불가", price: 30 },
            eco_pkg: { name: "에코패키지", sub: "친환경 스웨이드/가죽 콤비+Recycled PET 헤드라이닝+BIO 페인트 (실내 컬러 패키지 중복 불가)", price: 20 },
            // 1.6T 전용
            htrac: { name: "HTRAC", sub: "험로주행모드+경사로 저속+후륜 멀티링크 (1.6T 가솔린/HEV)", price: 203 },
            // 프리미엄/인스퍼레이션 공통
            wide_sunroof: { name: "와이드 선루프", price: 59 },
            // N Line 전용
            alcantara: { name: "알칸타라 인테리어 패키지", sub: "알칸타라 스티어링/암레스트 (N라인 전용)", price: 37 }
          };
          
          // 2.0 / HEV는 HTRAC 미적용
          const KONA_GAS_20_OPTIONS = { ...KONA_OPTIONS };
          delete KONA_GAS_20_OPTIONS.htrac;
          delete KONA_GAS_20_OPTIONS.navi_pkg_2;
          delete KONA_GAS_20_OPTIONS.style_1;
          delete KONA_GAS_20_OPTIONS.wheel_18_hev;
          
          const KONA_GAS_OPTIONS = { ...KONA_OPTIONS };
          delete KONA_GAS_OPTIONS.navi_pkg_2;
          delete KONA_GAS_OPTIONS.style_1;
          delete KONA_GAS_OPTIONS.wheel_18_hev;
          
          const KONA_HEV_OPTIONS = { ...KONA_OPTIONS };
          delete KONA_HEV_OPTIONS.navi_pkg_1;
          delete KONA_HEV_OPTIONS.style_lite;
          delete KONA_HEV_OPTIONS.wheel_19_gas;
          delete KONA_HEV_OPTIONS.htrac;
          // HEV는 2WD 전용 (4WD HTRAC 없음 - PDF 정부신고연비표 확인)
          
          // 배타 그룹 (navi_pkg_1/2는 variant별로 한쪽만 존재해서 그룹 불필요)
          const KONA_EXCLUSIVE = [
            { id: "roof", label: "루프 옵션", members: ["two_tone_roof", "wide_sunroof"] },
            { id: "smart_sense", label: "스마트센스", members: ["smart_sense_1", "smart_sense_3", "best_selection"] },
            { id: "color", label: "실내 컬러", members: ["color_pkg", "eco_pkg"] }
          ];
          const KONA_EXCLUDES = {
            // 베스트셀렉션은 클러스터/스마트센스 묶음
            best_selection: ["smart_sense_3", "cluster_123"]
          };
          
          // 트림 표준사양
          const MODERN_F = ["스마트스트림 G 1.6 T-GDI / 2.0 / 1.6 HEV", "8단 자동변속기 / IVT / 6단 DCT", "전자식 변속 칼럼", "통합 주행모드", "6에어백+전복커튼", "유아용 시트 고정장치(2열)", "세이프티 언락", "다중 충돌방지 자동제동", "실내 소화기", "FCA(차량/보행자/자전거)", "LKA/LFA/ISLA/DAW/HBA", "후석 승객 알림", "MFR LED 헤드램프", "심리스 호라이즌 LED(주간/포지셔닝)", "LED 테일/제동/보조제동", "17\" 알로이", "아웃사이드 미러(열선/전동접이/LED방향)", "에어로 와이퍼", "이중접합 차음유리(윈드실드)", "4.2\" 클러스터", "가죽 스티어링(열선)", "직물시트", "1열 열선시트", "2열 6:4 분할 폴딩", "운전석 수동 높이조절", "매뉴얼 에어컨 (HEV는 듀얼 풀오토)", "USB C타입(1/2열 충전)", "EPB(오토홀드)", "수동 틸트&텔레스코픽", "버튼시동/스마트키", "원격시동", "전방/후방 주차 거리경고", "후방 모니터", "패들쉬프트", "크루즈 컨트롤", "오토라이트", "파워 아웃렛(1열)", "12.3\" 디스플레이 오디오(블루링크/폰프로젝션)", "6스피커", "OTA"];
          const HPICK_F = ["+BCW(주행)/BCA(전진 출차)/RCCA/안전 하차 경고", "루프랙", "18\" 알로이 (가솔린 1.6T) / 17\" (HEV)", "인조가죽 적용 내장(동승석 오픈 트레이/도어센터/암레스트)", "LED 실내등", "인조가죽 시트(동승석 시트백 포켓)", "운전석 8way 전동(럼버서포트)", "1열 통풍시트", "듀얼 풀오토 에어컨(공기청정모드/애프터블로우)", "레인센서", "세이프티 파워 윈도우(1열)", "ECM 룸미러", "2열 에어벤트", "12.3\" 내비(인카페이먼트/e hi-pass)"];
          const PREMIUM_F = ["+실버 스키드 플레이트", "다크그레이 컬러 도장 클래딩/사이드 몰딩/범퍼", "벨트라인 크롬몰딩", "스포일러 가니쉬", "도어 포켓 라이팅(1열)", "Full LED 헤드(프로젝션)", "LED 방향지시등(앞/뒤)", "직물 루프 트림", "앰비언트 무드램프", "2열 암레스트", "하이패스", "커버링 쉘프", "스마트 파워테일게이트", "스마트폰 무선충전", "디지털 키 2 터치", "터치타입 아웃사이드 도어핸들(1열)"];
          const INSPIRATION_F = ["+진동경고 스티어링", "FCA(교차로/정면 대향차)", "HDA/SCC(스탑앤고)/NSCC(안전구간/곡선로)", "19\" 알로이 (가솔린) / 18\" (HEV)", "12.3\" 클러스터", "우븐 패브릭 감싸기(도어/오픈트레이)", "천연가죽 시트", "운전석 전동(릴랙션 컴포트/자세 메모리)", "동승석 8way 전동(릴랙션/워크인)", "2열 열선"];
          const BLACK_EXT_F = ["+블랙 익스테리어 전용(블랙 휠/바디컬러 클래딩/라디에이터 그릴 몰딩/범퍼/벨트라인/스키드 플레이트/스포일러/엠블럼)", "외장 컬러: 어비스 블랙 펄 1종"];
          const NLINE_F = ["+N라인 전용 외관(바디컬러 클래딩/전후 범퍼/19\" 휠 ※가솔린, 18\" ※HEV/사이드 스커트/윙타입 스포일러/싱글 트윈팁 머플러/블랙 미러)", "벨트라인 무광블랙 몰딩", "N라인 전용 천연가죽/알칸타라 콤비 시트", "메탈 페달", "메탈 도어 스커프", "레드 컬러 포인트"];
          
          return {
            model_id: "kona",
            model_name: "코나",
            category: "소형 SUV",
            year: 2027,
            variants: [
              // 가솔린 1.6 터보 (전체 6트림)
              {
                variant_id: "gasoline_1_6t",
                variant_name: "가솔린 1.6 터보",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 1598,
                transmission: "자동 8단",
                trims: [
                  { trim_id: "modern", name: "모던", seats: 5,
                    base_price_5: 2516, base_price_3_5: 2478,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 13.0, urban: 11.5, highway: 15.5, co2: 128 },
                    standard_features: MODERN_F,
                    available_options: ["navi_pkg_1", "smart_sense_1", "comfort_choice", "hipass"] },
                  { trim_id: "hpick", name: "H-Pick", seats: 5,
                    base_price_5: 2598, base_price_3_5: 2558,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.2, urban: 10.8, highway: 14.3, co2: 137 },
                    standard_features: HPICK_F,
                    available_options: ["best_selection", "style_lite", "smart_sense_3", "cluster_123", "parking_assist", "convenience", "builtin_cam", "hipass"] },
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 2864, base_price_3_5: 2821,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.2, urban: 10.8, highway: 14.3, co2: 137 },
                    standard_features: PREMIUM_F,
                    available_options: ["best_selection", "smart_sense_3", "cluster_123", "parking_assist", "seat_plus", "wheel_19_gas", "color_pkg", "htrac", "wide_sunroof", "builtin_cam"] },
                  { trim_id: "inspiration", name: "인스퍼레이션", seats: 5,
                    base_price_5: 3150, base_price_3_5: 3102,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.2, urban: 10.8, highway: 14.3, co2: 137 },
                    standard_features: INSPIRATION_F,
                    available_options: ["parking_assist", "bose", "two_tone_roof", "color_pkg", "eco_pkg", "htrac", "wide_sunroof", "builtin_cam"] },
                  { trim_id: "black_exterior", operating: false, name: "블랙 익스테리어", seats: 5,
                    base_price_5: 3185, base_price_3_5: 3137,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.2, urban: 10.8, highway: 14.3, co2: 137 },
                    standard_features: BLACK_EXT_F,
                    available_options: ["parking_assist", "bose", "htrac", "wide_sunroof", "builtin_cam"] },
                  { trim_id: "n_line", operating: false, name: "N 라인", seats: 5,
                    base_price_5: 3249, base_price_3_5: 3199,
                    engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.2, urban: 10.8, highway: 14.3, co2: 137 },
                    standard_features: NLINE_F,
                    available_options: ["parking_assist", "bose", "two_tone_roof", "htrac", "wide_sunroof", "builtin_cam", "alcantara"] }
                ],
                options_master: KONA_GAS_OPTIONS,
                exclusive_groups: KONA_EXCLUSIVE,
                option_excludes: KONA_EXCLUDES
              },
              // 가솔린 2.0 (NA, ISG, IVT) - Modern, H-Pick만
              {
                variant_id: "gasoline_2_0",
                variant_name: "가솔린 2.0",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 1999,
                transmission: "스마트스트림 IVT",
                trims: [
                  { trim_id: "modern", name: "모던", seats: 5,
                    base_price_5: 2446, base_price_3_5: 2409,
                    engine: "스마트스트림 G 2.0",
                    fuel_economy: { combined: 13.6, urban: 12.6, highway: 15.0, co2: 121 },
                    standard_features: MODERN_F,
                    available_options: ["navi_pkg_1", "smart_sense_1", "comfort_choice", "hipass"] },
                  { trim_id: "hpick", name: "H-Pick", seats: 5,
                    base_price_5: 2538, base_price_3_5: 2499,
                    engine: "스마트스트림 G 2.0",
                    fuel_economy: { combined: 13.0, urban: 11.8, highway: 14.7, co2: 127 },
                    standard_features: HPICK_F,
                    available_options: ["best_selection", "style_lite", "smart_sense_3", "cluster_123", "parking_assist", "convenience", "builtin_cam", "hipass"] }
                ],
                options_master: KONA_GAS_20_OPTIONS,
                exclusive_groups: KONA_EXCLUSIVE,
                option_excludes: KONA_EXCLUDES
              },
              // 하이브리드 1.6 (HEV - PDF 세후 가격)
              {
                variant_id: "hybrid_1_6",
                variant_name: "하이브리드 1.6",
                vehicle_type: "RV (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1580,
                transmission: "6단 DCT",
                trims: [
                  { trim_id: "modern", name: "모던", seats: 5,
                    base_price_5: 3102, base_price_3_5: 3053,
                    engine: "스마트스트림 G 1.6 HEV (시스템 출력 + 32kW 모터)",
                    fuel_economy: { combined: 19.8, urban: 20.8, highway: 18.6, co2: 79 },
                    standard_features: MODERN_F,
                    available_options: ["navi_pkg_2", "smart_sense_1", "comfort_choice", "hipass"] },
                  { trim_id: "hpick", name: "H-Pick", seats: 5,
                    base_price_5: 3194, base_price_3_5: 3144,
                    engine: "스마트스트림 G 1.6 HEV",
                    fuel_economy: { combined: 19.8, urban: 20.8, highway: 18.6, co2: 79 },
                    standard_features: HPICK_F,
                    available_options: ["best_selection", "style_1", "smart_sense_3", "cluster_123", "parking_assist", "convenience", "builtin_cam", "hipass"] },
                  { trim_id: "premium", name: "프리미엄", seats: 5,
                    base_price_5: 3406, base_price_3_5: 3352,
                    engine: "스마트스트림 G 1.6 HEV",
                    fuel_economy: { combined: 18.1, urban: 18.6, highway: 17.5, co2: 87 },
                    standard_features: PREMIUM_F,
                    available_options: ["best_selection", "smart_sense_3", "cluster_123", "parking_assist", "seat_plus", "wheel_18_hev", "color_pkg", "wide_sunroof", "builtin_cam"] },
                  { trim_id: "inspiration", name: "인스퍼레이션", seats: 5,
                    base_price_5: 3668, base_price_3_5: 3610,
                    engine: "스마트스트림 G 1.6 HEV",
                    fuel_economy: { combined: 18.1, urban: 18.6, highway: 17.5, co2: 87 },
                    standard_features: INSPIRATION_F,
                    available_options: ["parking_assist", "bose", "two_tone_roof", "color_pkg", "eco_pkg", "wide_sunroof", "builtin_cam"] },
                  { trim_id: "black_exterior", name: "블랙 익스테리어", seats: 5,
                    base_price_5: 3693, base_price_3_5: 3636,
                    engine: "스마트스트림 G 1.6 HEV",
                    fuel_economy: { combined: 18.1, urban: 18.6, highway: 17.5, co2: 87 },
                    standard_features: BLACK_EXT_F,
                    available_options: ["parking_assist", "bose", "wide_sunroof", "builtin_cam"] },
                  { trim_id: "n_line", operating: false, name: "N 라인", seats: 5,
                    base_price_5: 3667, base_price_3_5: 3609,
                    engine: "스마트스트림 G 1.6 HEV",
                    fuel_economy: { combined: 18.1, urban: 18.6, highway: 17.5, co2: 87 },
                    standard_features: NLINE_F,
                    available_options: ["parking_assist", "bose", "two_tone_roof", "wide_sunroof", "builtin_cam", "alcantara"] }
                ],
                options_master: KONA_HEV_OPTIONS,
                exclusive_groups: KONA_EXCLUSIVE,
                option_excludes: KONA_EXCLUDES
              }
            ],
            exterior_colors: [
              { name: "아틀라스 화이트", code: "SAW", hex: "#f0f0ee", price: 0 },
              { name: "사이버 그레이 메탈릭", code: "C5G", hex: "#6d6f70", price: 0 },
              { name: "에코트로닉 그레이 펄", code: "PE2", hex: "#7a7a78", price: 0 },
              { name: "미라지 그린", code: "RRR", hex: "#5d6b54", price: 0 },
              { name: "네오테릭 옐로우", code: "YYY", hex: "#d4c34a", price: 0 },
              { name: "얼티메이트 레드 메탈릭", code: "R2P", hex: "#a02830", price: 0 },
              { name: "어비스 블랙 펄", code: "A2B", hex: "#1a1a1a", price: 0 }
            ]
          };
        })(),
        
        // ========== 투싼 ==========
        (() => {
          const TUCSON_OPTIONS = {
            htrac: { name: "HTRAC (4WD)", sub: "+ 경사로 저속 주행장치", price: 198 },
            lifestyle: { name: "라이프 스타일", sub: "LED 도어 스팟+LED 테일게이트+러기지 매트", price: 39 },
            side_step: { name: "사이드 스텝", price: 34 },
            black_side_step: { name: "블랙 사이드스텝", price: 39 },
            builtin_cam: { name: "빌트인 캠 2 + 증강현실 내비", price: 45 },
            sunroof_roofrack: { name: "파노라마 선루프 + 루프랙", price: 116 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 109 },
            navi_pkg: { name: "인포테인먼트 내비", sub: "12.3\"내비+지문결제+듀얼풀오토+레인센서+하이패스", price: 89 },
            smart_sense: { name: "현대 스마트센스", sub: "FCA(교차/정면)+SCC+어드밴스드RCA (내비 동시 적용 시 HDA/NSCC 포함)", price: 40 },
            comfort_1: { name: "컴포트 Ⅰ", sub: "1열 통풍+운전석 8way 전동+2열 열선+2열 폴딩레버", price: 69 },
            comfort_2: { name: "컴포트 Ⅱ", sub: "운전석 8way+IMS+동승석 8way 전동(워크인)+2열 열선 ※스마트센스 동시 불가", price: 74 },
            exterior_design_1: { name: "익스테리어 디자인 Ⅰ", sub: "Full LED 프로젝션(히든DRL/지능형)+LED 리어콤비+18\"휠", price: 69 },
            exterior_design_2: { name: "익스테리어 디자인 Ⅱ", sub: "Full LED 프로젝션+LED 리어콤비+19\"휠", price: 69 },
            parking_assist_1: { name: "파킹 어시스트 Ⅰ (가솔린)", sub: "파노라마 디스플레이+12.3\"클러스터+SVM+BVM+RPCA+측방경고", price: 123 },
            parking_assist_2: { name: "파킹 어시스트 Ⅱ (HEV)", sub: "파노라마 디스플레이+12.3\"클러스터+SVM+BVM+RPCA+측방경고+원격주차", price: 153 },
            platinum: { name: "플래티넘", sub: "BOSE 8스피커+디지털키2+무드램프", price: 109 },
            best_selection_3: { name: "베스트 셀렉션 Ⅲ (가솔린)", sub: "파킹 어시스트 Ⅲ + BOSE 묶음 할인", price: 122 },
            best_selection_4: { name: "베스트 셀렉션 Ⅳ (HEV)", sub: "파킹 어시스트 Ⅳ + BOSE 묶음 할인", price: 152 },
            parking_assist_3: { name: "파킹 어시스트 Ⅲ (가솔린)", sub: "SVM+BVM+RPCA+측방경고", price: 83 },
            parking_assist_4: { name: "파킹 어시스트 Ⅳ (HEV)", sub: "SVM+BVM+RPCA+측방경고+원격주차", price: 113 },
            bose: { name: "BOSE 프리미엄 사운드", sub: "8스피커+외장앰프", price: 59 },
            wheel_19_michelin: { name: "19\" 알로이 + 미쉐린 타이어 (가솔린)", sub: "블랙 익스테리어 적용 시 선택 불가", price: 45 },
            wheel_19_michelin_hev: { name: "19\" 알로이 + 미쉐린 타이어 (HEV)", sub: "블랙 익스테리어 적용 시 선택 불가", price: 25 },
            michelin_tires: { name: "미쉐린 타이어", sub: "N라인 전용 (19\" 휠 변경 없음)", price: 20 }
          };
          
          // 배타 그룹
          const TUCSON_EXCLUSIVE = [
            { id: "side_step", label: "사이드 스텝", members: ["side_step", "black_side_step"] },
            { id: "sunroof", label: "선루프", members: ["sunroof_roofrack", "panoramic_sunroof"] },
            { id: "ext_design", label: "익스테리어 디자인", members: ["exterior_design_1", "exterior_design_2"] },
            { id: "comfort", label: "컴포트 패키지", members: ["comfort_1", "comfort_2"] },
            { id: "parking_assist", label: "파킹 어시스트", members: ["parking_assist_1", "parking_assist_3", "parking_assist_2", "parking_assist_4"] }
          ];
          // 포함 관계
          const TUCSON_EXCLUDES = {
            "comfort_2": ["smart_sense"],  // 옵션 sub 명시: 스마트센스 동시 불가
            "best_selection_3": ["parking_assist_3", "bose"],  // 가솔린 묶음
            "best_selection_4": ["parking_assist_4", "bose"]   // HEV 묶음
          };
          
          // 트림 표준사양
          const MODERN_F = ["스마트스트림 G 1.6 T-GDI", "7단 DCT", "ISG", "FCA(차량/보행자/자전거)", "LKA/LFA/HBA/DAW", "ISLA", "BCA/RCCA/SEW", "후석승객알림", "8에어백", "다중 충돌방지 자동제동", "17\"알로이", "Full LED(MFR)", "다크크롬 그릴", "유광블랙 B/C필러", "이중접합 차음유리(1열)", "도어포켓라이팅(1열)", "가죽 스티어링(열선)", "인조가죽시트", "1열 열선", "운전석 럼버서포트", "EPB", "버튼시동/스마트키", "원격시동", "매뉴얼 에어컨", "12.3\"디스플레이오디오+6스피커", "OTA", "지문인증(개인화/시동)"];
          const PREMIUM_F = ["+18\"알로이", "루프랙", "리얼 스티치 내장(크래시패드/도어)", "1열 통풍시트", "인조가죽시트(패턴)", "2열 폴딩 레버", "듀얼 풀오토 에어컨", "레인센서", "하이패스", "스마트 파워테일게이트", "지문결제", "무선충전", "12.3\"내비"];
          const HPICK_F = ["+FCA(교차/정면)", "SCC(스탑앤고)", "어드밴스드 후석승객알림", "NSCC", "HDA", "운전석 8way 전동(IMS)", "동승석 8way 전동(워크인)", "2열 열선시트"];
          const INSPIRATION_F = ["+Full LED 프로젝션(히든DRL/지능형)", "LED 리어콤비", "파노라마 커브드 디스플레이", "12.3\"클러스터", "앰비언트 무드", "메탈 페달/도어스커프", "퀼팅 천연가죽 시트", "디지털키 2", "HUD"];
          const BLACK_EXT_F = ["+블랙 익스테리어 전용 디자인(범퍼/스키드/19\"블랙휠/블랙미러/블랙 DLO)", "메탈 풋레스트"];
          const NLINE_F = ["+N라인 전용 디자인(그릴/범퍼/스키드/19\"휠/리어스포일러/싱글트윈팁)", "N라인 전용 스티어링/시트(레드스티치)", "블랙 헤드라이닝", "메탈 풋레스트", "수에이드+천연가죽 시트"];
          
          return {
            model_id: "tucson",
            model_name: "투싼",
            category: "중형 SUV",
            year: 2026,
            variants: [
              // 가솔린 1.6 터보 (PDF 2025-05-14 기준)
              {
                variant_id: "gasoline_1_6t",
                variant_name: "가솔린 1.6 터보",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 1598,
                transmission: "스마트스트림 7단 DCT",
                trims: [
                  { trim_id: "modern", name: "모던", seats: 5, base_price_5: 2848, base_price_3_5: 2805, engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.5, urban: 11.5, highway: 13.9, co2: 133 },
                    standard_features: MODERN_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "sunroof_roofrack", "exterior_design_1", "navi_pkg", "smart_sense", "comfort_1"] },
                  { trim_id: "premium", name: "프리미엄", seats: 5, base_price_5: 3116, base_price_3_5: 3069, engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.5, urban: 11.5, highway: 13.8, co2: 133 },
                    standard_features: PREMIUM_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "builtin_cam", "panoramic_sunroof", "exterior_design_2", "parking_assist_1", "comfort_2", "smart_sense", "platinum"] },
                  { trim_id: "hpick", name: "H-Pick", seats: 5, base_price_5: 3205, base_price_3_5: 3156, engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.5, urban: 11.5, highway: 13.8, co2: 133 },
                    standard_features: HPICK_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "builtin_cam", "panoramic_sunroof", "exterior_design_2", "parking_assist_1", "platinum"] },
                  { trim_id: "inspiration", name: "인스퍼레이션", seats: 5, base_price_5: 3460, base_price_3_5: 3407, engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.0, urban: 10.9, highway: 13.6, co2: 139 },
                    standard_features: INSPIRATION_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "best_selection_3", "builtin_cam", "panoramic_sunroof", "parking_assist_3", "bose", "wheel_19_michelin"] },
                  { trim_id: "black_exterior", name: "블랙 익스테리어", seats: 5, base_price_5: 3505, base_price_3_5: 3452, engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.0, urban: 10.9, highway: 13.6, co2: 139 },
                    standard_features: BLACK_EXT_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "best_selection_3", "builtin_cam", "panoramic_sunroof", "parking_assist_3", "bose"] },
                  { trim_id: "n_line", operating: false, name: "N 라인", seats: 5, base_price_5: 3545, base_price_3_5: 3491, engine: "스마트스트림 G 1.6 T-GDI",
                    fuel_economy: { combined: 12.0, urban: 10.9, highway: 13.6, co2: 139 },
                    standard_features: NLINE_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "best_selection_3", "builtin_cam", "panoramic_sunroof", "parking_assist_3", "bose", "michelin_tires"] }
                ],
                options_master: TUCSON_OPTIONS,
                exclusive_groups: TUCSON_EXCLUSIVE,
                option_excludes: TUCSON_EXCLUDES
              },
              // 하이브리드 1.6T (PDF 2025-05-14 기준, 세제혜택 후 가격)
              {
                variant_id: "hybrid_1_6t",
                variant_name: "하이브리드 1.6T",
                vehicle_type: "RV (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1598,
                transmission: "6단 자동",
                trims: [
                  { trim_id: "modern", name: "모던", seats: 5, base_price_5: 3422, base_price_3_5: 3368, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 16.2, urban: 17.0, highway: 15.2, co2: 99 },
                    standard_features: MODERN_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "sunroof_roofrack", "exterior_design_1", "navi_pkg", "smart_sense", "comfort_1"],
                    trim_prices: { htrac: 223, exterior_design_1: 85, navi_pkg: 59 } },
                  { trim_id: "premium", name: "프리미엄", seats: 5, base_price_5: 3670, base_price_3_5: 3612, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 16.2, urban: 17.0, highway: 15.2, co2: 99 },
                    standard_features: PREMIUM_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "builtin_cam", "panoramic_sunroof", "exterior_design_2", "comfort_2", "smart_sense", "platinum", "parking_assist_2"],
                    trim_prices: { htrac: 223 } },
                  { trim_id: "hpick", name: "H-Pick", seats: 5, base_price_5: 3754, base_price_3_5: 3695, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 16.2, urban: 17.0, highway: 15.2, co2: 99 },
                    standard_features: HPICK_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "builtin_cam", "panoramic_sunroof", "exterior_design_2", "platinum", "parking_assist_2"],
                    trim_prices: { htrac: 223 } },
                  { trim_id: "inspiration", name: "인스퍼레이션", seats: 5, base_price_5: 4022, base_price_3_5: 3959, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 14.9, urban: 15.1, highway: 14.5, co2: 109 },
                    standard_features: INSPIRATION_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "best_selection_4", "builtin_cam", "panoramic_sunroof", "parking_assist_4", "bose", "wheel_19_michelin_hev"],
                    trim_prices: { htrac: 223 } },
                  { trim_id: "black_exterior", name: "블랙 익스테리어", seats: 5, base_price_5: 4067, base_price_3_5: 4003, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 14.9, urban: 15.1, highway: 14.5, co2: 109 },
                    standard_features: BLACK_EXT_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "best_selection_4", "builtin_cam", "panoramic_sunroof", "parking_assist_4", "bose"],
                    trim_prices: { htrac: 223 } },
                  { trim_id: "n_line", operating: false, name: "N 라인", seats: 5, base_price_5: 3987, base_price_3_5: 3925, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 14.9, urban: 15.1, highway: 14.5, co2: 109 },
                    standard_features: NLINE_F,
                    available_options: ["htrac", "lifestyle", "side_step", "black_side_step", "best_selection_4", "builtin_cam", "panoramic_sunroof", "parking_assist_4", "bose", "michelin_tires"],
                    trim_prices: { htrac: 223 } }
                ],
                options_master: TUCSON_OPTIONS,
                exclusive_groups: TUCSON_EXCLUSIVE,
                option_excludes: TUCSON_EXCLUDES
              }
            ],
            exterior_colors: [
              { name: "크리미 화이트 펄", code: "TW3", hex: "#f6f1e8", price: 10 },
              { name: "팬텀 블랙 펄", code: "TCM", hex: "#1a1a1a", price: 0 },
              { name: "아마존 그레이 메탈릭", code: "A5G", hex: "#5c5d58", price: 0 },
              { name: "에코트로닉 그레이 펄", code: "PE2", hex: "#7a7a78", price: 0 },
              { name: "오션 인디고 펄", code: "PS8", hex: "#1e3a5f", price: 0 },
              { name: "쉬머링 실버 메탈릭", code: "R2T", hex: "#b5b5b5", price: 0 }
            ]
          };
        })(),
        
        // ========== 싼타페 ==========
        (() => {
          const SANTAFE_OPTIONS = {
            htrac: { name: "HTRAC (4WD)", sub: "+ 험로주행모드 (+223만)", price: 223 },
            sunroof_roofrack: { name: "듀얼와이드 선루프 + 루프랙", price: 99 },
            panoramic_sunroof: { name: "듀얼와이드 선루프", price: 89 },
            passenger_8way: { name: "동승석 8way 전동시트", price: 20 },
            hud: { name: "헤드업 디스플레이", price: 59 },
            parking_assist_plus_1: { name: "파킹 어시스트 플러스 Ⅰ", sub: "SVM+BVM+측방경고+RSPA+RPCA", price: 119 },
            platinum_1: { name: "플래티넘 Ⅰ", sub: "디지털키2+무선충전(듀얼)", price: 45 },
            best_selection_1: { name: "베스트 셀렉션 Ⅰ", sub: "파킹 어시스트 플러스 Ⅰ+플래티넘 Ⅰ 묶음 (개별선택 불가)", price: 150 },
            seat_plus: { name: "시트플러스", sub: "에르고모션(18way)+릴렉션컴포트+동승석워크인+전동틸트", price: 74 },
            design_plus_1: { name: "디자인 플러스 Ⅰ (프레스티지 AWD용)", sub: "20\"휠+천연가죽+스웨이드 내장+무드+2열 도어커튼", price: 135 },
            design_plus_2: { name: "디자인 플러스 Ⅱ (프레스티지 2WD용)", sub: "천연가죽+스웨이드 내장+무드+2열 도어커튼", price: 85 },
            wheel_20: { name: "20\" 휠 & 타이어", price: 49 },
            bose: { name: "BOSE 프리미엄 사운드", sub: "12스피커+외장앰프", price: 64 },
            black_ink_plus: { name: "블랙잉크 플러스 패키지", sub: "블랙 사이드스텝+전용 도어스팟램프 (블랙 잉크 트림용)", price: 94 },
            builtin_cam: { name: "빌트인 캠 2 + 증강현실 내비", price: 45 },
            seat_6: { name: "6인승 (2열 전동 독립시트+윙타입헤드레스트)", price: 104 },
            seat_7: { name: "7인승 (2열 원터치 워크인)", price: 69 },
            lifestyle: { name: "라이프 스타일", sub: "리버서블 러기지 매트+메탈 트랜스버스+LED 도어/테일게이트 램프", price: 49 }
          };
          
          // 배타 그룹
          const SANTAFE_EXCLUSIVE = [
            { id: "seats", label: "좌석 구성", members: ["seat_6", "seat_7"] },
            { id: "sunroof", label: "선루프", members: ["sunroof_roofrack", "panoramic_sunroof"] },
            { id: "design_plus", label: "디자인 플러스", members: ["design_plus_1", "design_plus_2"] }
          ];
          // 포함 관계
          const SANTAFE_EXCLUDES = {
            "best_selection_1": ["parking_assist_plus_1", "platinum_1"],  // 묶음 할인
            "design_plus_1": ["wheel_20"]  // 디자인 플러스 I에 20"휠 포함
          };
          
          const EXCLUSIVE_F = ["1.6T HEV / 2.5T 엔진", "10에어백", "FCA(차량/보행자/자전거/교차로)", "LKA2/LFA/HBA/DAW", "ISLA", "SCC+NSCC+HDA", "BCA/RCCA/SEW", "어드밴스드 후석승객알림", "스티어링휠 그립감지", "진동경고 휠", "18\"알로이", "MFR LED 헤드램프", "다이내믹 웰컴(앞)", "히든 어시스트 핸들", "가죽 스티어링(열선)", "멜란지 니트 내장", "파노라믹 커브드 디스플레이", "12.3\"클러스터", "인조가죽 시트", "운전석 8way 전동(럼버)", "1열 열선/통풍", "2열 열선", "2열 6:4 폴딩/슬라이딩/리클라이닝", "2열 리모트 폴딩", "EPB", "12.3\"내비+6스피커", "스마트 파워테일게이트", "지문인증", "220V 인버터", "무선충전(싱글)", "1열 음성 wake up"];
          const PRESTIGE_F = ["+FCA(교차/추월/측방/회피)", "HDA2", "BCA(주행)", "NSCC(진출입로)", "Full LED 프로젝션", "루프랙", "메탈 도어스커프/페달", "동승석 8way 전동", "무선충전(듀얼)", "후진 가이드 램프", "디지털키 2"];
          const HPICK_F = ["+RPCA", "운전석 에르고모션 시트(18way)", "동승석 워크인", "1열 릴렉션 컴포트(레그레스트)", "운전석 스마트 자세제어", "천연가죽시트", "인조가죽 적용 내장", "스웨이드 헤드라이닝/필라", "앰비언트 무드", "2열 수동식 도어커튼", "SVM/BVM", "측방경고", "RSPA", "HUD", "전동 틸트&텔레스코픽"];
          const BLACK_EXT_F = ["+블랙 익스테리어 전용 외관(그릴/스키드/범퍼몰딩/사이드가니시/도어핸들/C필러/루프랙/엠블럼)"];
          const CALLIGRAPHY_F = ["+캘리 전용 디자인(20\"휠+그릴+가니쉬+인테이크 그릴+블랙 하이그로시 클래딩)", "투톤 가죽 스티어링", "나파가죽 시트", "UV-C 살균 멀티 트레이", "디지털 센터미러"];
          const BLACK_INK_F = ["+20\" 블랙잉크 전용 알로이", "블랙 잉크 전용 외관(그릴/스키드/범퍼/사이드/C/D필러/루프랙/엠블럼)", "블랙잉크 전용 블랙 내장"];
          
          return {
            model_id: "santafe",
            model_name: "싼타페",
            category: "중대형 SUV",
            year: 2026,
            variants: [
              // 가솔린 2.5 터보 (2WD 기본 / HTRAC 옵션으로 AWD)
              {
                variant_id: "gasoline_2_5t",
                variant_name: "가솔린 2.5 터보",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "스마트스트림 습식 8단 DCT",
                trims: [
                  { trim_id: "exclusive", name: "익스클루시브", seats: 5,
                    base_price_5: 3662, base_price_3_5: 3606,
                    engine: "스마트스트림 G 2.5 T-GDI (281hp)",
                    fuel_economy: { combined: 11.0, urban: 9.6, highway: 13.4, co2: 152 },
                    standard_features: EXCLUSIVE_F,
                    available_options: ["htrac", "sunroof_roofrack", "passenger_8way", "hud", "parking_assist_plus_1", "platinum_1", "best_selection_1", "builtin_cam", "seat_6", "seat_7", "lifestyle"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 5,
                    base_price_5: 3949, base_price_3_5: 3889,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 11.0, urban: 9.6, highway: 13.4, co2: 152 },
                    standard_features: PRESTIGE_F,
                    available_options: ["htrac", "panoramic_sunroof", "hud", "seat_plus", "parking_assist_plus_1", "design_plus_2", "wheel_20", "builtin_cam", "seat_6", "seat_7", "lifestyle"] },
                  { trim_id: "hpick", name: "H-Pick", seats: 5,
                    base_price_5: 4214, base_price_3_5: 4150,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 11.0, urban: 9.6, highway: 13.4, co2: 152 },
                    standard_features: HPICK_F,
                    available_options: ["htrac", "panoramic_sunroof", "bose", "wheel_20", "builtin_cam", "seat_6", "seat_7", "lifestyle"] },
                  { trim_id: "black_exterior", name: "H-Pick 블랙 익스테리어", seats: 5,
                    base_price_5: 4249, base_price_3_5: 4184,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 11.0, urban: 9.6, highway: 13.4, co2: 152 },
                    standard_features: BLACK_EXT_F,
                    available_options: ["htrac", "panoramic_sunroof", "bose", "wheel_20", "builtin_cam", "seat_6", "seat_7"] },
                  { trim_id: "calligraphy", name: "캘리그래피", seats: 5,
                    base_price_5: 4553, base_price_3_5: 4484,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 10.0, urban: 8.8, highway: 12.0, co2: 168 },
                    standard_features: CALLIGRAPHY_F,
                    available_options: ["htrac", "panoramic_sunroof", "bose", "builtin_cam", "seat_6", "seat_7"] },
                  { trim_id: "black_ink", name: "캘리그래피 블랙 잉크", seats: 5,
                    base_price_5: 4553, base_price_3_5: 4484,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 10.0, urban: 8.8, highway: 12.0, co2: 168 },
                    standard_features: BLACK_INK_F,
                    available_options: ["htrac", "panoramic_sunroof", "bose", "black_ink_plus", "builtin_cam", "seat_6", "seat_7"] }
                ],
                options_master: SANTAFE_OPTIONS,
                exclusive_groups: SANTAFE_EXCLUSIVE,
                option_excludes: SANTAFE_EXCLUDES
              },
              // 하이브리드 1.6T 2WD (세제혜택 후)
              {
                variant_id: "hybrid_1_6t",
                variant_name: "하이브리드 1.6T (세제혜택 후)",
                vehicle_type: "RV (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1598,
                transmission: "6단 자동",
                trims: [
                  { trim_id: "exclusive", name: "익스클루시브", seats: 5, base_price_5: 4127, base_price_3_5: 4062, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 15.5, urban: 16.3, highway: 14.6, co2: 104 },
                    standard_features: EXCLUSIVE_F,
                    available_options: ["htrac", "sunroof_roofrack", "passenger_8way", "hud", "parking_assist_plus_1", "platinum_1", "best_selection_1", "builtin_cam", "seat_6", "seat_7", "lifestyle"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 4414, base_price_3_5: 4345, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 15.5, co2: 104 },
                    standard_features: PRESTIGE_F,
                    available_options: ["htrac", "panoramic_sunroof", "hud", "seat_plus", "parking_assist_plus_1", "design_plus_2", "wheel_20", "builtin_cam", "seat_6", "seat_7", "lifestyle"] },
                  { trim_id: "hpick", name: "H-Pick", seats: 5, base_price_5: 4679, base_price_3_5: 4606, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 15.5, co2: 104 },
                    standard_features: HPICK_F,
                    available_options: ["htrac", "panoramic_sunroof", "bose", "wheel_20", "builtin_cam", "seat_6", "seat_7", "lifestyle"] },
                  { trim_id: "black_exterior", operating: false, name: "H-Pick 블랙 익스테리어", seats: 5, base_price_5: 4614, base_price_3_5: 4542, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 15.5, co2: 104 },
                    standard_features: BLACK_EXT_F,
                    available_options: ["htrac", "panoramic_sunroof", "bose", "wheel_20", "builtin_cam", "seat_6", "seat_7"] },
                  { trim_id: "calligraphy", name: "캘리그래피", seats: 5, base_price_5: 4983, base_price_3_5: 4905, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 14.4, urban: 14.9, highway: 13.8, co2: 112 },
                    standard_features: CALLIGRAPHY_F,
                    available_options: ["htrac", "panoramic_sunroof", "bose", "builtin_cam", "seat_6", "seat_7"] },
                  { trim_id: "black_ink", operating: false, name: "캘리그래피 블랙 잉크", seats: 5, base_price_5: 4883, base_price_3_5: 4807, engine: "스마트스트림 G 1.6 T-GDI HEV",
                    fuel_economy: { combined: 14.4, co2: 112 },
                    standard_features: BLACK_INK_F,
                    available_options: ["htrac", "panoramic_sunroof", "bose", "black_ink_plus", "builtin_cam", "seat_6", "seat_7"] }
                ],
                options_master: SANTAFE_OPTIONS,
                exclusive_groups: SANTAFE_EXCLUSIVE,
                option_excludes: SANTAFE_EXCLUDES
              }
            ],
            exterior_colors: [
              { name: "크리미 화이트 펄", code: "WW2", hex: "#f6f1e8", price: 8 },
              { name: "에코트로닉 그레이 펄", code: "PE2", hex: "#7a7a78", price: 0 },
              { name: "페블 블루 펄", code: "PB2", hex: "#3a4a5a", price: 0 },
              { name: "사이버 세이지 펄", code: "RS2", hex: "#7d8773", price: 0 },
              { name: "오카도 그린 펄", code: "RN2", hex: "#3d5544", price: 0 },
              { name: "어비스 블랙 펄", code: "A2B", hex: "#1a1a1a", price: 0 },
              { name: "크리미 화이트 매트(무광)", code: "WWM", hex: "#ebe6dd", price: 20 },
              { name: "얼씨 브래스 매트(무광)", code: "YBM", hex: "#7a6440", price: 20 }
            ]
          };
        })(),
        
        // ========== 디 올 뉴 팰리세이드 (2025.1.15 출시 / PDF 정확보정) ==========
        (() => {
          // 9인승 옵션 가격 (PDF 명시값)
          const PALISADE_OPTIONS_9 = {
            // 공통 선택 품목
            htrac: { name: "HTRAC + 험로주행모드 + 경사로 저속 주행장치", price: 228 },
            panoramic_sunroof: { name: "듀얼 와이드 선루프", price: 85 },
            builtin_cam_plus: { name: "빌트인 캠 2 Plus + 증강현실 내비게이션", price: 66 },
            side_step: { name: "H Genuine Accessories 사이드스텝", price: 43 },
            air_purifier: { name: "H Genuine Accessories 빌트인 공기청정기", price: 52 },
            // Exclusive 전용
            smart_sense: { name: "현대 스마트센스", sub: "12.3\"클러스터+파노라믹 커브드+FCA2+NSCC(진출입로)+HDA2+BCA(주행)+어드밴스드 후석승객알림", price: 133 },
            comfort: { name: "컴포트", sub: "천연가죽시트+전동 틸트&텔레스코픽+운전석 4way 럼버 IMS+동승석 럼버/워크인+발수 1열 유리+스마트 파워테일게이트+측방 주차거리경고+SVM/BVM", price: 133 },
            // Prestige 전용
            comfort_plus: { name: "컴포트 플러스 (9인승)", sub: "나파가죽+스웨이드 내장+에르고모션 18way 시트+1열 릴렉션 컴포트+2열 6:4분할(전동폴딩/통풍/리모트)+3열 전동/열선", price: 185 },
            remote_parking: { name: "원격 스마트 주차 보조", price: 66 },
            platinum: { name: "플래티넘", sub: "BOSE 14스피커+HUD+디지털 키 2+다이내믹 웰컴/에스코트", price: 171 },
            lifestyle: { name: "H Genuine Accessories 라이프스타일 (9인승)", sub: "LED 도어 스팟+테일게이트 램프+러기지 프로텍션 매트+스크린+네트", price: 63 },
            lifestyle_hev: { name: "H Genuine Accessories 라이프스타일 HEV (9인승)", sub: "LED 도어 스팟+테일게이트 램프+러기지 프로텍션 매트+스크린+네트+실내 V2L", price: 110 },
            // Calligraphy 옵션
            preview_susp: { name: "프리뷰 전자제어 서스펜션", sub: "21\" 캘리 전용 휠 & 피렐리 (캘리그래피 전용)", price: 123 }
          };
          
          // 7인승 옵션 가격 (PDF 명시값 - 9인승보다 약간 비쌈)
          const PALISADE_OPTIONS_7 = {
            // 공통
            htrac: { name: "HTRAC + 험로주행모드 + 경사로 저속 주행장치", price: 240 },
            panoramic_sunroof: { name: "듀얼 와이드 선루프", price: 90 },
            builtin_cam_plus: { name: "빌트인 캠 2 Plus + 증강현실 내비게이션", price: 70 },
            side_step: { name: "H Genuine Accessories 사이드스텝", price: 45 },
            air_purifier: { name: "H Genuine Accessories 빌트인 공기청정기", price: 55 },
            // Exclusive 전용
            smart_sense: { name: "현대 스마트센스", sub: "12.3\"클러스터+파노라믹 커브드+FCA2+NSCC(진출입로)+HDA2+BCA(주행)+어드밴스드 후석승객알림", price: 140 },
            comfort: { name: "컴포트", sub: "천연가죽시트+전동 틸트&텔레스코픽+운전석 4way 럼버 IMS+동승석 럼버/워크인+발수 1열 유리+스마트 파워테일게이트+측방 주차거리경고+SVM/BVM", price: 140 },
            // Prestige 전용
            comfort_plus: { name: "컴포트 플러스 (7인승)", sub: "나파가죽+스웨이드 내장+에르고모션 18way+1열 릴렉션 컴포트+2열 전동 독립시트(통풍/리모트/전동 워크인)+3열 전동/열선", price: 220 },
            dynamic_bodycare: { name: "2열 다이내믹 바디케어 시트", sub: "2열 전동 진동/두드림 모드 (컴포트 플러스 선택 시)", price: 80 },
            remote_parking: { name: "원격 스마트 주차 보조", price: 70 },
            platinum: { name: "플래티넘", sub: "BOSE 14스피커+HUD+디지털 키 2+다이내믹 웰컴/에스코트", price: 180 },
            lifestyle: { name: "H Genuine Accessories 라이프스타일 (7인승)", sub: "LED 도어 스팟+테일게이트 램프+러기지 프로텍션 매트+스크린+네트+220V 인버터", price: 70 },
            lifestyle_hev: { name: "H Genuine Accessories 라이프스타일 HEV (7인승)", sub: "LED 도어 스팟+테일게이트 램프+러기지 프로텍션 매트+스크린+네트+실내 V2L", price: 116 },
            // Calligraphy 옵션
            preview_susp: { name: "프리뷰 전자제어 서스펜션", sub: "21\" 캘리 전용 휠 & 피렐리 (캘리그래피 전용)", price: 130 }
          };
          
          // 트림별 의존성 (Prestige+Calligraphy 옵션 트리)
          const PALISADE_REQUIRES_9 = {
            comfort_plus: { prestige: [] },     // Prestige에서 선택 가능
            platinum: { prestige: ["comfort_plus"] },  // Prestige에서 플래티넘은 컴포트 플러스 필요
            remote_parking: { prestige: ["comfort_plus"] }
          };
          const PALISADE_REQUIRES_7 = {
            comfort_plus: { prestige: [] },
            dynamic_bodycare: { prestige: ["comfort_plus"], calligraphy: [] },
            platinum: { prestige: ["comfort_plus"] },
            remote_parking: { prestige: ["comfort_plus"] }
          };
          
          const EXCLUSIVE_F = ["스마트스트림 G 2.5 T-GDI (281hp / 43kgf·m)", "8단 자동변속기", "ISG", "통합 주행모드", "R-MDPS", "전자식 변속 칼럼(진동 경고)", "셀프레벨라이저", "10에어백(어드밴스드/센터사이드/사이드/무릎/전복커튼)", "다중 충돌방지 자동제동", "유아용 시트 고정장치(2/3열)", "FCA(차량/보행자/자전거/교차로 대향차/정면 대향차)", "LKA/LFA2/ISLA/DAW/HBA", "안전 하차 보조", "후석 승객 알림", "SCC(스탑앤고)", "NSCC(안전구간/곡선로)", "HDA", "BCW(주행)/BCA(전진 출차)/RCCA", "스티어링 휠 그립감지", "진동경고 스티어링", "운전자 모니터링 시스템", "크롬 라디에이터 그릴", "18\" 알로이", "Full LED 헤드(프로젝션)", "LED 주간주행등/포지셔닝/방향/리어콤비/보조제동", "이중접합 차음유리(윈드실드/1·2열)", "리어 스포일러", "크롬 DLO 몰딩", "테일게이트 블랙 가니쉬", "루프랙", "도어 포켓 라이팅(1열)", "4.2\" 클러스터", "베젤리스 인사이드 미러", "가죽 스티어링(열선/인터랙티브 픽셀)", "도어 암레스트 리얼 스티치", "LED 실내등", "인조가죽 시트(블랙)", "운전석 8way 전동(럼버)", "동승석 8way 전동", "1열 센터시트", "1열 열선/통풍", "2열 6:4 분할(폴딩/슬라이딩/리클라이닝/리모트 폴딩/원터치 틸팅 워크인) ※9인 / 2열 독립시트 ※7인", "2열 열선", "3열 6:4 분할(폴드&다이브/리클라이닝)", "버튼시동/스마트키", "원격시동", "EPB(오토홀드)", "패들쉬프트", "수동식 틸트&텔레스코픽", "3존 풀오토 에어컨", "전후석 통합 터치 공조", "레인센서", "하이패스", "100W USB-C(1/2/3열 충전 6포트)", "스위치타입 USB-C", "파워 아웃렛(1/3열)", "세이프티 파워 윈도우(1/2열)", "후방 모니터(카메라 클리닝)", "확산형 루프 에어벤트", "오토라이트", "전방/후방 주차 거리 경고", "워크 어웨이 락", "스마트폰 무선충전", "2열 버클 조명", "2열 어시스트 그립", "현대 AI 어시스턴트", "12.3\" 내비(블루링크/폰프로젝션/인카페이먼트/e hi-pass/아케이드 게임 6종)", "8스피커", "후석 취침/대화모드", "OTA"];
          const PRESTIGE_F = ["+FCA2(교차/추월/측방/회피 조향)", "NSCC(진출입로)", "HDA2", "BCA(주행)", "어드밴스드 후석승객알림", "후방 주차 충돌방지 보조", "히든라이팅 DRL/포지셔닝", "20\" 알로이", "발수 적용 1열 유리", "파노라믹 커브드 디스플레이", "12.3\" 클러스터", "인조가죽 감싸기(크래쉬패드/도어암레스트)", "멜란지 니트 내장재(헤드라이닝/필라/선바이저)", "메탈 도어스커프", "천연가죽 시트(블랙/그레이)", "운전석 4way 럼버+자세 메모리", "동승석 럼버+워크인", "전동 틸트&텔레스코픽", "스마트 파워테일게이트", "측방 주차 거리 경고", "SVM/BVM", "실내 지문 인증"];
          const CALLIGRAPHY_F = ["+원격 스마트 주차 보조", "캘리그래피 전용 디자인(20\" 휠/라디에이터 그릴&가니쉬/인테이크 그릴/스키드 플레이트/바디컬러 클래딩/테일게이트 가니쉬)", "다이내믹 웰컴/에스코트 라이트", "투톤 가죽 스티어링", "고급형 인조가죽 감싸기", "스웨이드 내장재(헤드라이닝/필라/선바이저)", "메탈 트랜스버스 트림+페달", "우드 인테리어", "실버 메탈 데코 몰딩(2열/러기지)", "주행모드 연동 앰비언트 무드램프", "디지털 센터 미러", "고급 카매트", "나파가죽 시트(리얼 메탈 패치)", "운전석 에르고 모션(18way 4way럼버/볼스터 전동/스트레칭)", "1열 릴랙션 컴포트(레그레스트)", "2열 6:4 분할(전동 폴딩/수동 슬라이딩/전동 리클라이닝/윙아웃 헤드레스트) ※9인 / 2열 전동 독립시트(전동식 틸팅 워크인) ※7인", "2열 리모트 폴딩&언폴딩", "2열 통풍", "3열 전동 6:4 분할(폴드&다이브/슬라이딩/리클라이닝)", "3열 열선", "운전석 스마트 자세제어", "HUD", "2열 수동 도어 커튼", "디지털 키 2", "BOSE 14스피커(외장앰프 포함)", "양문형 멀티콘솔(UV-C 살균) ※7인"];
          
          return {
            model_id: "palisade",
            model_name: "디 올 뉴 팰리세이드",
            category: "준대형 SUV",
            year: 2025,
            variants: [
              // 가솔린 2.5 터보 9인승 (9인승 면세 - 5%=3.5% 동일)
              {
                variant_id: "gasoline_25t_9",
                variant_name: "가솔린 2.5 터보 9인승",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "자동 8단",
                trims: [
                  { trim_id: "exclusive", name: "익스클루시브", seats: 9,
                    base_price_5: 4383, base_price_3_5: 4383,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 9.7, urban: 8.5, highway: 11.6, co2: 174 },
                    standard_features: EXCLUSIVE_F,
                    available_options: ["smart_sense", "comfort", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 9,
                    base_price_5: 4936, base_price_3_5: 4936,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 9.7, urban: 8.5, highway: 11.6, co2: 174 },
                    standard_features: [...EXCLUSIVE_F, ...PRESTIGE_F],
                    available_options: ["comfort_plus", "remote_parking", "platinum", "lifestyle", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] },
                  { trim_id: "calligraphy", name: "캘리그래피", seats: 9,
                    base_price_5: 5586, base_price_3_5: 5586,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 9.7, urban: 8.5, highway: 11.6, co2: 174 },
                    standard_features: [...EXCLUSIVE_F, ...PRESTIGE_F, ...CALLIGRAPHY_F],
                    available_options: ["lifestyle", "preview_susp", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] }
                ],
                options_master: PALISADE_OPTIONS_9,
                requires_in_trim: PALISADE_REQUIRES_9
              },
              // 가솔린 2.5 터보 7인승 (개소세 적용)
              {
                variant_id: "gasoline_25t_7",
                variant_name: "가솔린 2.5 터보 7인승",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "자동 8단",
                trims: [
                  { trim_id: "exclusive", name: "익스클루시브", seats: 7,
                    base_price_5: 4516, base_price_3_5: 4447,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 9.7, urban: 8.5, highway: 11.6, co2: 174 },
                    standard_features: EXCLUSIVE_F,
                    available_options: ["smart_sense", "comfort", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 7,
                    base_price_5: 5099, base_price_3_5: 5022,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 9.7, urban: 8.5, highway: 11.6, co2: 174 },
                    standard_features: [...EXCLUSIVE_F, ...PRESTIGE_F],
                    available_options: ["comfort_plus", "dynamic_bodycare", "remote_parking", "platinum", "lifestyle", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] },
                  { trim_id: "calligraphy", name: "캘리그래피", seats: 7,
                    base_price_5: 5794, base_price_3_5: 5706,
                    engine: "스마트스트림 G 2.5 T-GDI",
                    fuel_economy: { combined: 9.7, urban: 8.5, highway: 11.6, co2: 174 },
                    standard_features: [...EXCLUSIVE_F, ...PRESTIGE_F, ...CALLIGRAPHY_F],
                    available_options: ["dynamic_bodycare", "lifestyle", "preview_susp", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] }
                ],
                options_master: PALISADE_OPTIONS_7,
                requires_in_trim: PALISADE_REQUIRES_7
              },
              // ===== HEV 추가 (2025.1.15) =====
              // 하이브리드 2.5 터보 9인승 (친환경차 9인승+ → 개소세 100% 면세)
              {
                variant_id: "hev_25t_9",
                variant_name: "하이브리드 2.5 터보 9인승",
                vehicle_type: "RV",
                fuel: "하이브리드",
                displacement_cc: 2497,
                transmission: "자동 6단",
                trims: [
                  { trim_id: "exclusive", name: "익스클루시브", seats: 9,
                    base_price_5: 4982, base_price_3_5: 4982,
                    engine: "스마트스트림 G 2.5 T-GDI 하이브리드 (54.0kW 모터)",
                    fuel_economy: { combined: 14.1, urban: 14.5, highway: 13.6, co2: 114 },
                    standard_features: ["스마트스트림 G 2.5 T-GDI 하이브리드", "6단 자동변속기", "하이브리드 시스템 (54.0kW 모터/리튬이온/회생제동)", "e-Motion Drive (e-Dynamic/e-Comfort)", "통합 주행모드", "R-MDPS", "전자식 변속 칼럼(진동 경고)", "셀프레벨라이저", "10에어백(어드밴스드/센터사이드/사이드/무릎/전복커튼)", "다중 충돌방지 자동제동", "유아용 시트 고정장치(2/3열)", "FCA(차량/보행자/자전거/교차로 대향차/정면 대향차)", "LKA/LFA2/ISLA/DAW/HBA", "안전 하차 보조", "후석 승객 알림", "SCC(스탑앤고)", "NSCC(안전구간/곡선로)", "HDA", "BCW(주행)/BCA(전진 출차)/RCCA", "스티어링 휠 그립감지", "진동경고 스티어링", "운전자 모니터링 시스템", "크롬 라디에이터 그릴", "18\" 알로이", "Full LED 헤드(프로젝션)", "LED 주간주행등/포지셔닝/방향/리어콤비/보조제동", "이중접합 차음유리(윈드실드/1·2열)", "리어 스포일러", "크롬 DLO 몰딩", "테일게이트 블랙 가니쉬", "루프랙", "도어 포켓 라이팅(1열)", "4.2\" 클러스터", "베젤리스 인사이드 미러", "가죽 스티어링(열선/인터랙티브 픽셀)", "도어 암레스트 리얼 스티치", "LED 실내등", "인조가죽 시트(블랙)", "운전석 8way 전동(럼버)", "동승석 8way 전동", "1열 센터시트", "1열 열선/통풍", "2열 6:4 분할(폴딩/슬라이딩/리클라이닝/리모트 폴딩/원터치 틸팅 워크인)", "2열 열선", "3열 6:4 분할(폴드&다이브/리클라이닝)", "버튼시동/스마트키", "원격시동", "EPB(오토홀드)", "패들쉬프트", "수동식 틸트&텔레스코픽", "3존 풀오토 에어컨", "전후석 통합 터치 공조", "레인센서", "하이패스", "100W USB-C(1/2/3열 충전 6포트)", "스위치타입 USB-C", "파워 아웃렛(1/3열)", "세이프티 파워 윈도우(1/2열)", "후방 모니터(카메라 클리닝)", "확산형 루프 에어벤트", "오토라이트", "전방/후방 주차 거리 경고", "워크 어웨이 락", "스마트폰 무선충전", "2열 버클 조명", "2열 어시스트 그립", "현대 AI 어시스턴트", "12.3\" 내비(블루링크/폰프로젝션/인카페이먼트/e hi-pass/아케이드 게임 6종)", "8스피커", "후석 취침/대화모드", "OTA"],
                    available_options: ["smart_sense", "comfort", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 9,
                    base_price_5: 5536, base_price_3_5: 5536,
                    engine: "스마트스트림 G 2.5 T-GDI 하이브리드 (54.0kW 모터)",
                    fuel_economy: { combined: 14.1, urban: 14.5, highway: 13.6, co2: 114 },
                    standard_features: ["스마트스트림 G 2.5 T-GDI 하이브리드", "6단 자동변속기", "하이브리드 시스템 (54.0kW 모터/리튬이온/회생제동)", "e-Motion Drive (e-Dynamic/e-Comfort)", ...PRESTIGE_F.slice(0)],
                    available_options: ["comfort_plus", "remote_parking", "platinum", "lifestyle_hev", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] },
                  { trim_id: "calligraphy", name: "캘리그래피", seats: 9,
                    base_price_5: 6186, base_price_3_5: 6186,
                    engine: "스마트스트림 G 2.5 T-GDI 하이브리드 (54.0kW 모터)",
                    fuel_economy: { combined: 14.1, urban: 14.5, highway: 13.6, co2: 114 },
                    standard_features: ["스마트스트림 G 2.5 T-GDI 하이브리드", "6단 자동변속기", "하이브리드 시스템 (54.0kW 모터/리튬이온/회생제동)", "e-Motion Drive (e-Dynamic/e-Comfort)", ...PRESTIGE_F, ...CALLIGRAPHY_F],
                    available_options: ["lifestyle_hev", "preview_susp", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] }
                ],
                options_master: PALISADE_OPTIONS_9,
                requires_in_trim: PALISADE_REQUIRES_9
              },
              // 하이브리드 2.5 터보 7인승 (HEV 친환경차 감면 후 가격 / 익스는 PDF 명시값, 프레/캘리는 -100만 추정 적용)
              {
                variant_id: "hev_25t_7",
                variant_name: "하이브리드 2.5 터보 7인승",
                vehicle_type: "RV",
                fuel: "하이브리드",
                displacement_cc: 2497,
                transmission: "자동 6단",
                trims: [
                  { trim_id: "exclusive", name: "익스클루시브", seats: 7,
                    base_price_5: 5146, base_price_3_5: 5066,
                    engine: "스마트스트림 G 2.5 T-GDI 하이브리드 (54.0kW 모터)",
                    fuel_economy: { combined: 14.1, urban: 14.5, highway: 13.6, co2: 114 },
                    standard_features: ["스마트스트림 G 2.5 T-GDI 하이브리드", "6단 자동변속기", "하이브리드 시스템 (54.0kW 모터/리튬이온/회생제동)", "e-Motion Drive (e-Dynamic/e-Comfort)", "통합 주행모드", "R-MDPS", "전자식 변속 칼럼(진동 경고)", "셀프레벨라이저", "10에어백(어드밴스드/센터사이드/사이드/무릎/전복커튼)", "다중 충돌방지 자동제동", "유아용 시트 고정장치(2/3열)", "FCA(차량/보행자/자전거/교차로 대향차/정면 대향차)", "LKA/LFA2/ISLA/DAW/HBA", "안전 하차 보조", "후석 승객 알림", "SCC(스탑앤고)", "NSCC(안전구간/곡선로)", "HDA", "BCW(주행)/BCA(전진 출차)/RCCA", "스티어링 휠 그립감지", "진동경고 스티어링", "운전자 모니터링 시스템", "크롬 라디에이터 그릴", "18\" 알로이", "Full LED 헤드(프로젝션)", "LED 주간주행등/포지셔닝/방향/리어콤비/보조제동", "이중접합 차음유리(윈드실드/1·2열)", "리어 스포일러", "크롬 DLO 몰딩", "테일게이트 블랙 가니쉬", "루프랙", "도어 포켓 라이팅(1열)", "4.2\" 클러스터", "베젤리스 인사이드 미러", "가죽 스티어링(열선/인터랙티브 픽셀)", "도어 암레스트 리얼 스티치", "LED 실내등", "인조가죽 시트(블랙)", "운전석 8way 전동(럼버)", "동승석 8way 전동", "1열 열선/통풍", "2열 독립시트(폴딩/슬라이딩/리클라이닝/리모트 폴딩/원터치 틸팅 워크인)", "2열 열선", "3열 6:4 분할(폴드&다이브/리클라이닝)", "버튼시동/스마트키", "원격시동", "EPB(오토홀드)", "패들쉬프트", "수동식 틸트&텔레스코픽", "3존 풀오토 에어컨", "전후석 통합 터치 공조", "레인센서", "하이패스", "100W USB-C(1/2/3열 충전 6포트)", "스위치타입 USB-C", "파워 아웃렛(1/3열)", "세이프티 파워 윈도우(1/2열)", "후방 모니터(카메라 클리닝)", "확산형 루프 에어벤트", "오토라이트", "전방/후방 주차 거리 경고", "워크 어웨이 락", "스마트폰 무선충전", "2열 버클 조명", "2열 어시스트 그립", "현대 AI 어시스턴트", "12.3\" 내비(블루링크/폰프로젝션/인카페이먼트/e hi-pass/아케이드 게임 6종)", "8스피커", "후석 취침/대화모드", "OTA"],
                    available_options: ["smart_sense", "comfort", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 7,
                    base_price_5: 5729, base_price_3_5: 5640,
                    engine: "스마트스트림 G 2.5 T-GDI 하이브리드 (54.0kW 모터)",
                    fuel_economy: { combined: 14.1, urban: 14.5, highway: 13.6, co2: 114 },
                    standard_features: ["스마트스트림 G 2.5 T-GDI 하이브리드", "6단 자동변속기", "하이브리드 시스템 (54.0kW 모터/리튬이온/회생제동)", "e-Motion Drive (e-Dynamic/e-Comfort)", ...PRESTIGE_F.slice(0)],
                    available_options: ["comfort_plus", "dynamic_bodycare", "remote_parking", "platinum", "lifestyle_hev", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] },
                  { trim_id: "calligraphy", name: "캘리그래피", seats: 7,
                    base_price_5: 6424, base_price_3_5: 6324,
                    engine: "스마트스트림 G 2.5 T-GDI 하이브리드 (54.0kW 모터)",
                    fuel_economy: { combined: 14.1, urban: 14.5, highway: 13.6, co2: 114 },
                    standard_features: ["스마트스트림 G 2.5 T-GDI 하이브리드", "6단 자동변속기", "하이브리드 시스템 (54.0kW 모터/리튬이온/회생제동)", "e-Motion Drive (e-Dynamic/e-Comfort)", ...PRESTIGE_F, ...CALLIGRAPHY_F],
                    available_options: ["dynamic_bodycare", "lifestyle_hev", "preview_susp", "htrac", "panoramic_sunroof", "builtin_cam_plus", "side_step", "air_purifier"] }
                ],
                options_master: PALISADE_OPTIONS_7,
                requires_in_trim: PALISADE_REQUIRES_7
              }
            ],
            exterior_colors: [
              { name: "크리미 화이트 펄", code: "WC9", hex: "#f4f1ea", price: 9 },
              { name: "쉬머링 실버 메탈릭", code: "R2T", hex: "#b5b5b5", price: 0 },
              { name: "에코트로닉 그레이 펄", code: "PE2", hex: "#7a7a78", price: 0 },
              { name: "클래지 블루 펄", code: "CBP", hex: "#2a3a55", price: 0 },
              { name: "캐스트 아이언 브라운 펄", code: "CRP", hex: "#5a4a3d", price: 0 },
              { name: "갤럭시 마룬 펄", code: "GMP", hex: "#5a2a35", price: 0 },
              { name: "어비스 블랙 펄", code: "A2B", hex: "#1a1a1a", price: 0 },
              { name: "로버스트 에메랄드 펄 (캘리 전용)", code: "R8N", hex: "#1f4d3a", price: 0 }
            ]
          };
        })(),
        
        // ========== 포터 II 2026 (2025.12.16 연식변경) ==========
        (() => {
          // 옵션 마스터 (포터II는 화물차 → 개소세 면세, 5%=3.5% 단일가)
          const PORTER_OPTIONS = {
            // 공통 옵션
            auto_5: { name: "5단 자동변속기", sub: "수동 6단 대비 (운전교습용/2WD 적용 가능, 4WD 미적용)", price: 113 },
            pto: { name: "PTO (Power Take Off)", sub: "자동변속기와 중복 적용 불가, 작동 한계 ≤2,500 RPM", price: 20 },
            heavy_suspension: { name: "중량짐용 후륜 현가장치", sub: "강화 리프 스프링(5매) - 일반캡/슈퍼캡 초장축 2WD 전용", price: 6 },
            cargo_cover: { name: "플라스틱 적재함 커버", sub: "H Genuine Accessories (일반캡·장축 적용 불가)", price: 63 },
            // 내비게이션 패키지
            navi_1: { name: "내비게이션 패키지Ⅰ", sub: "10.25\"내비(블루링크, 폰프로젝션)+OTA+버튼시동&스마트키+후방모니터+풀오토에어컨+하이패스+USB 충전기 (Smart 트림용)", price: 150 },
            navi_2: { name: "내비게이션 패키지Ⅱ", sub: "10.25\"내비(블루링크, 폰프로젝션)+OTA+버튼시동&스마트키+풀오토에어컨+하이패스 (Modern 트림용)", price: 95 }
          };
          
          // 트림별 표준사양
          const SMART_F = ["스마트스트림 LPG 2.5 터보 엔진", "6단 수동변속기", "운전석/동승석 에어백", "VDC(차체자세제어)", "경사로 밀림방지", "ESS(급제동 경보)", "타이어 응급처치 키트", "후진 경고음", "실내 소화기", "차동기어 잠금장치(LD)", "FCA(차량/보행자/자전거)", "LDW(차로 이탈 경고)", "195-70-R15/145-R13 + 풀사이즈 휠커버", "클리어타입 헤드램프(4등식+DRL)", "리어가드", "바디컬러 범퍼", "안개등", "측면방향지시등", "적재함 발청방지 실러", "자외선 차단 유리(앞)", "3.5\" 단색 LCD 클러스터", "인조가죽시트", "운전석 리클라이닝&슬라이딩 시트", "센터 시트백 콘솔박스", "키홀조명", "파워윈도우", "파워 아웃렛", "중앙집중식 도어잠금", "파워스티어링", "타코미터", "트립컴퓨터", "D&N 룸미러", "고무보조매트", "리놀륨 플로어매트", "폴딩타입 무선도어잠금", "배터리세이버", "후방 주차 거리 경고", "틸트 스티어링", "이모빌라이저", "오토라이트 컨트롤", "트리플 턴 시그널", "스티어링 휠 오디오 리모컨", "매뉴얼 에어컨", "운전석 열선/통풍시트", "전동식 럼버서포트", "가죽 스티어링(열선)", "선글라스 케이스", "운전석 윈도우 오토다운", "아웃사이드 미러(열선/전동조절/전동접이)", "일반 오디오(4스피커/라디오/MP3/USB/블루투스)"];
          const MODERN_F = ["+아웃사이드 미러(방향지시등)", "운전석 틸트 헤드레스트", "우드&메탈 그레인", "열선 리어글래스", "USB 충전기(1열 1개)", "8\" 디스플레이 오디오(폰 프로젝션)", "후방 모니터"];
          const PREMIUM_F = ["+범퍼가드", "고급형 풀사이즈 휠커버", "에어로 타입 와이퍼", "바디 컬러 아웃사이드 미러", "크루즈 컨트롤", "크롬 인사이드 도어 핸들", "크롬도금 파킹 브레이크 노브", "인조가죽 센터트림", "버튼시동 & 스마트키", "풀오토 에어컨", "하이패스", "10.25\" 내비게이션(폰 프로젝션, 블루링크)+OTA"];
          
          // 더블캡 (1열 우드&메탈 그레인+인조가죽 센터트림 기본, 2열 파워윈도우 추가)
          const DC_SMART_F = [...SMART_F.slice(0, -1), "1열 파워윈도우 + 2열 파워윈도우", "더블캡 전용 사이드 스텝", "우드&메탈 그레인", "인조가죽 센터트림", "일반 오디오(4스피커/라디오/MP3/USB/블루투스)"];
          const DC_MODERN_F = ["+아웃사이드 미러(방향지시등)", "운전석 틸트 헤드레스트", "열선 리어글래스", "USB 충전기(1열 1개)", "8\" 디스플레이 오디오(폰 프로젝션)", "후방 모니터"];
          const DC_PREMIUM_F = ["+범퍼가드", "고급형 풀사이즈 휠커버", "에어로 타입 와이퍼", "바디 컬러 아웃사이드 미러", "크루즈 컨트롤", "크롬 인사이드 도어 핸들", "크롬도금 파킹 브레이크 노브", "버튼시동 & 스마트키", "풀오토 에어컨", "하이패스", "10.25\" 내비게이션(폰 프로젝션, 블루링크)+OTA"];
          
          // 4WD (전용 서스펜션 + TPMS + 휠아치몰딩 추가)
          const SC_4WD_SMART_F = [...SMART_F, "4WD 전용 서스펜션", "TPMS(타이어 공기압 경보)", "휠아치 몰딩", "4륜 전환 레버", "195-R15 타이어"];
          const DC_4WD_SMART_F = [...DC_SMART_F, "4WD 전용 서스펜션", "TPMS", "휠아치 몰딩", "4륜 전환 레버", "195-R15 타이어"];
          
          // 운전교습용 (보조브레이크&보조클러치, 윈드실드 클리어 글래스)
          const TRAINING_F = ["스마트스트림 LPG 2.5 터보 엔진", "6단 수동변속기", "운전석/동승석 에어백", "VDC", "경사로 밀림방지", "ESS", "보조브레이크 & 보조클러치", "타이어 응급처치 키트", "후진 경고음", "실내 소화기", "FCA(차량/보행자/자전거 탑승자 미적용)", "LDW", "195-70-R15/145-R13 + 풀사이즈 휠커버", "클리어타입 헤드램프", "윈드실드 클리어 글래스", "리어가드", "바디컬러 범퍼", "안개등", "측면방향지시등", "적재함 발청방지 실러", "3.5\" 단색 LCD", "인조가죽시트", "운전석 리클라이닝&슬라이딩", "센터 시트백 콘솔박스", "키홀조명", "파워윈도우", "파워 아웃렛", "중앙집중식 도어잠금", "파워스티어링", "타코미터", "트립컴퓨터", "D&N 룸미러", "고무보조매트", "리놀륨 플로어매트", "아웃사이드 미러(열선/전동조절)", "폴딩타입 무선도어잠금", "배터리세이버", "후방 주차 거리 경고", "틸트 스티어링", "이모빌라이저", "오토라이트", "트리플 턴 시그널", "스티어링 휠 오디오 리모컨", "매뉴얼 에어컨", "일반 오디오(4스피커/라디오/MP3/USB/블루투스)"];
          
          // 트림 옵션 풀
          const SC_NORMAL_2WD_OPTS_SMART = ["heavy_suspension", "pto", "navi_1", "auto_5", "cargo_cover"];
          const SC_NORMAL_2WD_OPTS_MODERN = ["heavy_suspension", "pto", "navi_2", "auto_5", "cargo_cover"];
          const SC_NORMAL_2WD_OPTS_PREMIUM = ["heavy_suspension", "pto", "auto_5", "cargo_cover"];
          const DC_2WD_OPTS_SMART = ["navi_1", "auto_5", "cargo_cover"];
          const DC_2WD_OPTS_MODERN = ["navi_2", "auto_5", "cargo_cover"];
          const DC_2WD_OPTS_PREMIUM = ["auto_5", "cargo_cover"];
          const NORMAL_2WD_OPTS_SMART = ["heavy_suspension", "pto", "navi_1", "auto_5"];  // 일반캡: cargo_cover 적용 불가
          const NORMAL_2WD_OPTS_MODERN = ["heavy_suspension", "pto", "navi_2", "auto_5"];
          const NORMAL_2WD_OPTS_PREMIUM = ["heavy_suspension", "pto", "auto_5"];
          const SC_4WD_OPTS_SMART = ["pto", "navi_1"];  // 4WD: 자동변속기/cargo_cover 미적용
          const SC_4WD_OPTS_MODERN = ["pto", "navi_2"];
          const SC_4WD_OPTS_PREMIUM = ["pto"];
          
          return {
            model_id: "porter2",
            model_name: "포터2",
            category: "1톤 트럭 (2025.12.16 연식변경)",
            year: 2026,
            variants: [
              // ===== 2WD =====
              // 슈퍼캡 초장축 2WD
              {
                variant_id: "sc_long_2wd",
                variant_name: "LPI 2.5 슈퍼캡 초장축 2WD",
                vehicle_type: "1톤 트럭",
                fuel: "LPI",
                displacement_cc: 2469,
                transmission: "5단 자동",
                trims: [
                  // 운영 트림 — 5단 자동 baked in (Excel 차량DB R438/439 매칭)
                  { trim_id: "smart", name: "스마트", seats: 3,
                    base_price_5: 2265, base_price_3_5: 2265,
                    engine: "스마트스트림 LPI 2.5 터보 + 5단 자동",
                    fuel_economy: { combined: 7.0, urban: 6.7, highway: 7.4, co2: 188 },
                    standard_features: SMART_F,
                    available_options: SC_NORMAL_2WD_OPTS_SMART.filter(o => o !== 'auto_5') },
                  { trim_id: "modern", name: "모던", seats: 3,
                    base_price_5: 2370, base_price_3_5: 2370,
                    engine: "스마트스트림 LPI 2.5 터보 + 5단 자동",
                    fuel_economy: { combined: 7.0, urban: 6.7, highway: 7.4, co2: 188 },
                    standard_features: MODERN_F,
                    available_options: SC_NORMAL_2WD_OPTS_MODERN.filter(o => o !== 'auto_5') },
                  { trim_id: "premium", operating: false, name: "프리미엄", seats: 3,
                    base_price_5: 2380, base_price_3_5: 2380,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 7.0, urban: 6.7, highway: 7.4, co2: 188 },
                    standard_features: PREMIUM_F,
                    available_options: SC_NORMAL_2WD_OPTS_PREMIUM }
                ],
                options_master: PORTER_OPTIONS
              },
              // 더블캡 초장축 2WD
              {
                variant_id: "dc_long_2wd",
                variant_name: "LPI 2.5 더블캡 초장축 2WD",
                vehicle_type: "1톤 트럭 (더블캡)",
                fuel: "LPI",
                displacement_cc: 2469,
                transmission: "5단 자동",
                trims: [
                  // 운영 트림 — 5단 자동 baked in (Excel 차량DB R440/441 매칭)
                  { trim_id: "smart", name: "스마트", seats: 5,
                    base_price_5: 2408, base_price_3_5: 2408,
                    engine: "스마트스트림 LPI 2.5 터보 + 5단 자동",
                    fuel_economy: { combined: 6.8, urban: 6.5, highway: 7.2, co2: 195 },
                    standard_features: DC_SMART_F,
                    available_options: DC_2WD_OPTS_SMART.filter(o => o !== 'auto_5') },
                  { trim_id: "modern", name: "모던", seats: 5,
                    base_price_5: 2511, base_price_3_5: 2511,
                    engine: "스마트스트림 LPI 2.5 터보 + 5단 자동",
                    fuel_economy: { combined: 6.8, urban: 6.5, highway: 7.2, co2: 195 },
                    standard_features: DC_MODERN_F,
                    available_options: DC_2WD_OPTS_MODERN.filter(o => o !== 'auto_5') },
                  { trim_id: "premium", operating: false, name: "프리미엄", seats: 5,
                    base_price_5: 2513, base_price_3_5: 2513,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.8, urban: 6.5, highway: 7.2, co2: 195 },
                    standard_features: DC_PREMIUM_F,
                    available_options: DC_2WD_OPTS_PREMIUM }
                ],
                options_master: PORTER_OPTIONS
              },
              // 일반캡 초장축 2WD
              {
                variant_id: "normal_long_2wd",
                variant_name: "일반캡 초장축 2WD",
                vehicle_type: "1톤 트럭",
                fuel: "LPG",
                displacement_cc: 2469,
                transmission: "6단 수동 (자동 5단 옵션)",
                trims: [
                  { trim_id: "smart", operating: false, name: "스마트", seats: 3,
                    base_price_5: 2141, base_price_3_5: 2141,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 7.0, urban: 6.7, highway: 7.4, co2: 188 },
                    standard_features: SMART_F,
                    available_options: NORMAL_2WD_OPTS_SMART },
                  { trim_id: "modern", operating: false, name: "모던", seats: 3,
                    base_price_5: 2242, base_price_3_5: 2242,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 7.0, urban: 6.7, highway: 7.4, co2: 188 },
                    standard_features: MODERN_F,
                    available_options: NORMAL_2WD_OPTS_MODERN },
                  { trim_id: "premium", operating: false, name: "프리미엄", seats: 3,
                    base_price_5: 2365, base_price_3_5: 2365,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 7.0, urban: 6.7, highway: 7.4, co2: 188 },
                    standard_features: PREMIUM_F,
                    available_options: NORMAL_2WD_OPTS_PREMIUM }
                ],
                options_master: PORTER_OPTIONS
              },
              // ===== 4WD =====
              // 슈퍼캡 장축 4WD
              {
                variant_id: "sc_long_4wd",
                variant_name: "슈퍼캡 장축 4WD",
                vehicle_type: "1톤 트럭 (4WD)",
                fuel: "LPG",
                displacement_cc: 2469,
                transmission: "6단 수동",
                trims: [
                  { trim_id: "smart", operating: false, name: "스마트", seats: 3,
                    base_price_5: 2326, base_price_3_5: 2326,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.3, urban: 6.2, highway: 6.4, co2: 211 },
                    standard_features: SC_4WD_SMART_F,
                    available_options: SC_4WD_OPTS_SMART },
                  { trim_id: "modern", operating: false, name: "모던", seats: 3,
                    base_price_5: 2426, base_price_3_5: 2426,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.3, urban: 6.2, highway: 6.4, co2: 211 },
                    standard_features: MODERN_F,
                    available_options: SC_4WD_OPTS_MODERN },
                  { trim_id: "premium", operating: false, name: "프리미엄", seats: 3,
                    base_price_5: 2539, base_price_3_5: 2539,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.3, urban: 6.2, highway: 6.4, co2: 211 },
                    standard_features: PREMIUM_F,
                    available_options: SC_4WD_OPTS_PREMIUM }
                ],
                options_master: PORTER_OPTIONS
              },
              // 더블캡 장축 4WD (적재량 800kg)
              {
                variant_id: "dc_long_4wd",
                variant_name: "더블캡 장축 4WD",
                vehicle_type: "1톤 트럭 (더블캡 4WD, 적재 800kg)",
                fuel: "LPG",
                displacement_cc: 2469,
                transmission: "6단 수동",
                trims: [
                  { trim_id: "smart", operating: false, name: "스마트", seats: 5,
                    base_price_5: 2469, base_price_3_5: 2469,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.3, urban: 6.1, highway: 6.4, co2: 211 },
                    standard_features: DC_4WD_SMART_F,
                    available_options: SC_4WD_OPTS_SMART },
                  { trim_id: "modern", operating: false, name: "모던", seats: 5,
                    base_price_5: 2567, base_price_3_5: 2567,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.3, urban: 6.1, highway: 6.4, co2: 211 },
                    standard_features: DC_MODERN_F,
                    available_options: SC_4WD_OPTS_MODERN },
                  { trim_id: "premium", operating: false, name: "프리미엄", seats: 5,
                    base_price_5: 2666, base_price_3_5: 2666,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.3, urban: 6.1, highway: 6.4, co2: 211 },
                    standard_features: DC_PREMIUM_F,
                    available_options: SC_4WD_OPTS_PREMIUM }
                ],
                options_master: PORTER_OPTIONS
              },
              // 일반캡 장축 4WD
              {
                variant_id: "normal_long_4wd",
                variant_name: "일반캡 장축 4WD",
                vehicle_type: "1톤 트럭 (4WD)",
                fuel: "LPG",
                displacement_cc: 2469,
                transmission: "6단 수동",
                trims: [
                  { trim_id: "smart", operating: false, name: "스마트", seats: 3,
                    base_price_5: 2316, base_price_3_5: 2316,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.3, urban: 6.2, highway: 6.4, co2: 211 },
                    standard_features: SC_4WD_SMART_F,
                    available_options: SC_4WD_OPTS_SMART },
                  { trim_id: "modern", operating: false, name: "모던", seats: 3,
                    base_price_5: 2416, base_price_3_5: 2416,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.3, urban: 6.2, highway: 6.4, co2: 211 },
                    standard_features: MODERN_F,
                    available_options: SC_4WD_OPTS_MODERN },
                  { trim_id: "premium", operating: false, name: "프리미엄", seats: 3,
                    base_price_5: 2529, base_price_3_5: 2529,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.3, urban: 6.2, highway: 6.4, co2: 211 },
                    standard_features: PREMIUM_F,
                    available_options: SC_4WD_OPTS_PREMIUM }
                ],
                options_master: PORTER_OPTIONS
              },
              // ===== 운전교습용 2WD =====
              // 일반캡 초장축 운전교습용 2WD (단일 트림)
              {
                variant_id: "training_normal_2wd",
                variant_name: "일반캡 초장축 운전교습용 2WD",
                vehicle_type: "운전교습용 (보조브레이크&보조클러치)",
                fuel: "LPG",
                displacement_cc: 2469,
                transmission: "6단 수동 (자동 5단 옵션)",
                trims: [
                  { trim_id: "training", operating: false, name: "운전교습용", seats: 3,
                    base_price_5: 2058, base_price_3_5: 2058,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 7.0, urban: 6.7, highway: 7.4, co2: 188 },
                    standard_features: TRAINING_F,
                    available_options: ["auto_5"] }
                ],
                options_master: PORTER_OPTIONS
              },
              // 더블캡 운전교습용 2WD (단일 트림)
              {
                variant_id: "training_dc_2wd",
                variant_name: "더블캡 운전교습용 2WD",
                vehicle_type: "운전교습용 (더블캡, 보조브레이크&보조클러치)",
                fuel: "LPG",
                displacement_cc: 2469,
                transmission: "6단 수동 (자동 5단 옵션)",
                trims: [
                  { trim_id: "training", operating: false, name: "운전교습용", seats: 5,
                    base_price_5: 2196, base_price_3_5: 2196,
                    engine: "스마트스트림 LPG 2.5 터보",
                    fuel_economy: { combined: 6.8, urban: 6.5, highway: 7.2, co2: 195 },
                    standard_features: [...TRAINING_F, "더블캡 전용 사이드 스텝", "1열 파워윈도우", "선글라스 케이스"],
                    available_options: ["auto_5"] }
                ],
                options_master: PORTER_OPTIONS
              }
            ],
            exterior_colors: [
              { name: "크리미 화이트", code: "YAW", hex: "#f5f5f0", price: 0 },
              { name: "오닉스 블루", code: "ZV", hex: "#2d3e50", price: 0 },
              { name: "슬레이트 브라운", code: "RVB", hex: "#5a4a3d", price: 0 }
            ]
          };
        })()
      ]
    },
    {
      manufacturer_id: "kia",
      manufacturer_name: "기아",
      models: [
        // ========== 모닝 ==========
        (() => {
          const MORNING_OPTIONS = {
            button_start_pack: { name: "버튼시동 PACK", sub: "버튼시동 스마트키(원격시동)+하이패스 (트렌디 전용 옵션, 그 외 기본)", price: 50 },
            style_pkg: { name: "스타일 패키지", sub: "LED 헤드램프+턴시그널+주간주행등+리어콤비 (트렌디: +14\"알로이)", price: 90 },
            wheel_16: { name: "16\" 전면가공 휠", sub: "195/45 R16 + 후륜 디스크 (트렌디 50만/프레스티지 65만, 스타일 동시선택 시 40만)", price: 50 },
            comfort: { name: "컴포트", sub: "인조가죽시트+열선+운전석 시트암레스트+높이조절 (트렌디 전용)", price: 30 },
            convenience: { name: "컨비니언스", sub: "인조가죽 스티어링+가죽 변속노브+열선 스티어링", price: 15 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/정면)+SCC+BCA(경고/주행)+RCCA+안전하차경고 (프레스티지: 16\"휠 선택 시 가능)", price: 50, requires: ["wheel_16"] },
            navi_8: { name: "8\" 내비게이션", sub: "기아 커넥트+폰프로젝션+6스피커+ECM (트렌디 80만 - 버튼시동 PACK 필요, 프레스티지/시그니처/GT-Line은 70만, 버튼시동 PACK 기본)", price: 80,
              requires_in_trim: { trendy: ["button_start_pack"] } },
            sunroof: { name: "선루프", sub: "시그니처/GT-Line 전용", price: 40 }
          };
          
          // 밴 옵션
          const MORNING_VAN_OPTIONS = {
            button_start_pack: { name: "버튼시동 PACK", sub: "버튼시동 스마트키(원격시동)+하이패스", price: 50 },
            convenience: { name: "컨비니언스", sub: "인조가죽 스티어링+가죽 변속노브+열선 스티어링 (+트렌디: 전동접이+뒷좌석 파워윈도우)", price: 30 },
            navi_8: { name: "8\" 내비게이션", sub: "8\"내비+풀오토 에어컨+ECM (버튼시동 PACK 필요)", price: 70, requires: ["button_start_pack"] }
          };
          
          // 트림별 표준사양
          const TRENDY_F = ["스마트스트림 G 1.0 (76hp/9.7kgf·m)", "4단 자동", "MDPS", "FCA(차량/보행자/자전거)", "LKA/LFA/HBA/DAW", "ISLA", "6에어백", "VSM", "경사로 밀림방지", "175/65 R14 + 스틸휠+풀사이즈 휠커버", "프로젝션 헤드램프", "후방 모니터", "크루즈 컨트롤", "오토 라이트", "매뉴얼 에어컨", "8\" 디스플레이 오디오", "4스피커", "스마트폰 폰프로젝션(무선)"];
          const PRESTIGE_F = ["+14\" 알로이 휠", "LED 리피터 일체형 사이드미러", "블랙하이그로시 그릴", "크롬 벨트라인", "운전석 선바이저 거울", "인조가죽시트", "앞좌석 열선/운전석 통풍", "운전석 시트 높이조절", "운전석 시트 암레스트", "버튼시동 스마트키+원격시동", "하이패스", "풀오토 에어컨"];
          const SIGNATURE_F = ["+FCA(교차/정면)", "BCA/RCCA+안전하차경고", "SCC(정차&재출발)", "운전석 무릎 에어백", "후륜 디스크 브레이크", "195/45 R16 전면가공 휠", "인조가죽 스티어링(D컷X)", "가죽 변속노브", "EPB(오토홀드)", "열선 스티어링 휠", "운전석 세이프티 파워윈도우"];
          const GTLINE_F = ["+GT-Line 전용 외장(범퍼/그릴/디퓨저/사이드실/휠/엠블럼)", "LED 헤드램프", "프론트 LED 턴시그널", "LED 주간 주행등", "LED 리어콤비", "프론트 LED 센터 포지셔닝", "D컷 스티어링 휠", "메탈 페달"];
          
          return {
            model_id: "morning",
            model_name: "모닝",
            category: "경차 (해치백)",
            year: 2026,
            variants: [
              // 1.0 가솔린 (승용)
              {
                variant_id: "gasoline_1_0",
                variant_name: "가솔린 1.0 (승용)",
                vehicle_type: "경차",
                fuel: "가솔린",
                displacement_cc: 998,
                transmission: "4단 자동",
                trims: [
                  { trim_id: "trendy", name: "트렌디", seats: 4, base_price: 1395, engine: "스마트스트림 G 1.0 (76hp)",
                    fuel_economy: { combined: 14.7, urban: 13.5, highway: 16.3, co2: 112 },
                    standard_features: TRENDY_F,
                    available_options: ["button_start_pack", "style_pkg", "wheel_16", "comfort", "convenience", "navi_8", "sunroof"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 4, base_price: 1575, engine: "스마트스트림 G 1.0",
                    fuel_economy: { combined: 14.7, urban: 13.5, highway: 16.3, co2: 112 },
                    standard_features: PRESTIGE_F,
                    available_options: ["style_pkg", "wheel_16", "drive_wise", "navi_8", "sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 4, base_price: 1775, engine: "스마트스트림 G 1.0",
                    fuel_economy: { combined: 14.7, urban: 13.5, highway: 16.3, co2: 112 },
                    standard_features: SIGNATURE_F,
                    available_options: ["navi_8", "sunroof"] },
                  { trim_id: "gt_line", name: "GT-Line", seats: 4, base_price: 1870, engine: "스마트스트림 G 1.0",
                    fuel_economy: { combined: 14.7, urban: 13.5, highway: 16.3, co2: 112 },
                    standard_features: GTLINE_F,
                    available_options: ["navi_8", "sunroof"] }
                ],
                options_master: MORNING_OPTIONS
                // 충돌 없음 (스타일+16휠은 옵션 sub에 명시된 대로 동시 선택 가능, 14인치 알로이만 미적용)
              },
              // 1.0 가솔린 (밴)
              {
                variant_id: "van",
                variant_name: "가솔린 1.0 (밴)",
                vehicle_type: "화물(밴)",
                fuel: "가솔린",
                displacement_cc: 998,
                transmission: "4단 자동",
                trims: [
                  { trim_id: "trendy", name: "트렌디", seats: 2, base_price: 1375, engine: "스마트스트림 G 1.0",
                    fuel_economy: { combined: 14.7, urban: 13.5, highway: 16.3, co2: 112 },
                    standard_features: ["스마트스트림 G 1.0", "4단 자동", "FCA(차량/보행자/자전거)", "LKA/LFA/HBA/DAW", "ISLA", "6에어백", "175/65 R14 스틸휠", "프로젝션 헤드램프", "후방 모니터", "크루즈 컨트롤", "수동식 틸트", "1열 파워윈도우", "매뉴얼 에어컨", "8\" 디스플레이 오디오", "2스피커", "격벽/보호봉"],
                    available_options: ["button_start_pack", "convenience", "navi_8"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 2, base_price: 1440, engine: "스마트스트림 G 1.0",
                    fuel_economy: { combined: 14.7, urban: 13.5, highway: 16.3, co2: 112 },
                    standard_features: ["+풀사이즈 휠커버", "운전석 선바이저 거울", "인조가죽시트", "앞좌석 열선", "운전석 시트 암레스트/높이조절", "전동접이/락폴딩 사이드미러", "뒷좌석 파워윈도우"],
                    available_options: ["button_start_pack", "convenience", "navi_8"] }
                ],
                options_master: MORNING_VAN_OPTIONS
              }
            ],
            exterior_colors: [
              { name: "클리어 화이트", code: "UD", hex: "#f5f4f0", price: 0 },
              { name: "스파클링 실버", code: "KCS", hex: "#b5b5b5", price: 0 },
              { name: "시그널 레드", code: "BEG", hex: "#b53030", price: 0 },
              { name: "어드벤쳐러스 그린", code: "A2G", hex: "#5a6b54", price: 0 },
              { name: "아스트로 그레이", code: "M7G", hex: "#5d5e5f", price: 0 },
              { name: "오로라 블랙 펄", code: "ABP", hex: "#1a1a1a", price: 0 },
              { name: "밀키 베이지", code: "M9Y", hex: "#d8c9a5", price: 0 }
            ]
          };
        })(),
        
        // ========== 레이 ==========
        (() => {
          const RAY_OPTIONS = {
            button_start: { name: "버튼시동 스마트키", sub: "원격시동 포함 (트렌디 옵션, 그 외 기본)", price: 30 },
            style_pkg: { name: "스타일 패키지", sub: "프로젝션 헤드램프+LED DRL+LED 리어콤비+LED 보조제동등 (트렌디 95만/프레스티지 85만/시그니처/X-Line 50만)", price: 50 },
            comfort_1: { name: "컴포트 Ⅰ", sub: "인조가죽+앞 열선+운전석 통풍+풀폴딩+높이조절 (트렌디 전용)", price: 60 },
            comfort_2: { name: "컴포트 Ⅱ", sub: "뒷좌석 열선+고급형 센터콘솔+세이프티 파워윈도우 (프레스티지 옵션)", price: 30 },
            drive_wise: { name: "드라이브 와이즈", sub: "후측방 충돌경고+후측방 충돌방지+후방교차+안전하차 (트렌디는 버튼시동 필요)", price: 30,
              requires_in_trim: { trendy: ["button_start"] } },
            display_audio_8: { name: "8\" 디스플레이 오디오", sub: "+후방 모니터+샤크핀 안테나 (트렌디 전용, 내비와 중복 불가)", price: 50 },
            navi_8: { name: "8\" 내비게이션", sub: "기아 커넥트+풀오토 에어컨+ECM+하이패스+공기청정 (트렌디 145만 - 버튼시동 필요, 프레스티지 75만, 시그/X-Line 50만)", price: 75,
              requires_in_trim: { trendy: ["button_start"] } }
          };
          
          // 밴 옵션
          const RAY_VAN_OPTIONS = {
            button_start: { name: "버튼시동 스마트키", sub: "원격시동 포함", price: 30 },
            comfort: { name: "컴포트", sub: "열선/가죽 스티어링+가죽 변속노브 (스페셜 2인승은 운전석 통풍+풀폴딩 추가)", price: 15 },
            drive_wise: { name: "드라이브 와이즈", sub: "후측방 충돌경고+후측방 충돌방지+후방교차+안전하차 (버튼시동 필요)", price: 30, requires: ["button_start"] },
            navi_8: { name: "8\" 내비게이션", sub: "기아 커넥트+ECM+하이패스+공기청정 (트렌디 165만, 프레스티지/스페셜 145만, 버튼시동 필요)", price: 145, requires: ["button_start"] }
          };
          
          // 트림 표준사양 (승용)
          const RAY_TRENDY_F = ["카파 1.0 가솔린 (76hp/9.7kgf·m)", "4단 자동", "MDPS", "FCA(차량/보행자/자전거)", "LKA/LFA/HBA/DAW", "6에어백", "VSM", "165/60 R14 + 풀사이즈 휠커버", "후방 주차 거리 경고", "오토라이트", "크루즈 컨트롤", "1열/2열 파워윈도우", "매뉴얼 에어컨", "컴팩트 오디오", "4스피커", "뒷좌석 벤치폴딩"];
          const RAY_PRESTIGE_F = ["+14\" 알로이 휠", "LED 리피터 사이드미러", "블랙 하이그로시", "샤크핀 안테나", "가죽 스티어링", "가죽 변속노브", "인조가죽시트", "앞 열선+운전석 통풍", "풀폴딩 + 6:4 슬라이딩 폴딩", "운전석 시트 높이조절", "버튼시동 스마트키+원격시동", "후방 모니터", "열선 스티어링", "풀오토 에어컨", "공기청정 모드", "8\" 디스플레이 오디오"];
          const RAY_SIGNATURE_F = ["+후측방 충돌경고+후측방 충돌방지+후방교차+안전하차", "175/50 R15 + 전면가공 휠", "ECM 룸미러", "선바이저 조명", "고급형 센터콘솔", "뒷좌석 열선", "하이패스", "EPB(오토홀드)", "운전석 세이프티 파워윈도우"];
          const RAY_XLINE_F = ["+X-Line 전용 외장", "X-Line 전용 블랙 알로이 휠", "블랙 사이드미러", "다크메탈 센터/테일게이트 가니쉬", "블랙 스키드 플레이트", "블랙 루프(필름)", "블랙 A필라(필름)", "블랙 엠블럼", "X-Line 전용 엠블럼"];
          
          return {
            model_id: "ray",
            model_name: "레이",
            category: "경차 (박스카)",
            year: 2026,
            variants: [
              // 1.0 가솔린 (승용)
              {
                variant_id: "gasoline_1_0",
                variant_name: "가솔린 1.0 (승용)",
                vehicle_type: "경차",
                fuel: "가솔린",
                displacement_cc: 998,
                transmission: "4단 자동",
                trims: [
                  { trim_id: "trendy", name: "트렌디", seats: 4, base_price: 1490, engine: "카파 1.0 가솔린 (76hp)",
                    fuel_economy: { combined: 12.9, urban: 12.2, highway: 13.8, co2: 127 },
                    standard_features: RAY_TRENDY_F,
                    available_options: ["button_start", "style_pkg", "comfort_1", "drive_wise", "display_audio_8", "navi_8"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 4, base_price: 1760, engine: "카파 1.0 가솔린",
                    fuel_economy: { combined: 12.9, urban: 12.2, highway: 13.8, co2: 127 },
                    standard_features: RAY_PRESTIGE_F,
                    available_options: ["style_pkg", "comfort_2", "drive_wise", "navi_8"] },
                  { trim_id: "signature", name: "시그니처", seats: 4, base_price: 1903, engine: "카파 1.0 가솔린",
                    fuel_economy: { combined: 12.6, urban: 11.9, highway: 13.5, co2: 130 },
                    standard_features: RAY_SIGNATURE_F,
                    available_options: ["style_pkg", "navi_8"] },
                  { trim_id: "x_line", name: "X-Line", seats: 4, base_price: 2003, engine: "카파 1.0 가솔린",
                    fuel_economy: { combined: 12.6, urban: 11.9, highway: 13.5, co2: 130 },
                    standard_features: RAY_XLINE_F,
                    available_options: ["style_pkg", "navi_8"] }
                ],
                options_master: RAY_OPTIONS,
                // 트렌디에서 디스플레이 오디오 vs 내비게이션 중복 불가 (가격표 명시)
                exclusive_groups: [
                  { id: "audio", label: "인포테인먼트", members: ["display_audio_8", "navi_8"] }
                ]
              },
              // 1.0 가솔린 (2인승 밴)
              {
                variant_id: "van_2seat",
                variant_name: "가솔린 1.0 (밴 2인승)",
                vehicle_type: "화물(밴)",
                fuel: "가솔린",
                displacement_cc: 998,
                transmission: "4단 자동",
                trims: [
                  { trim_id: "trendy", name: "트렌디", seats: 2, base_price: 1451, engine: "카파 1.0 가솔린",
                    fuel_economy: { combined: 12.9, urban: 12.2, highway: 13.8, co2: 127 },
                    standard_features: ["카파 1.0 가솔린 (76hp)", "4단 자동", "FCA(차량/보행자/자전거)", "LKA/LFA/HBA/DAW", "6에어백", "VSM", "165/60 R14 + 풀사이즈 휠커버", "후방 주차 거리 경고", "오토라이트", "크루즈 컨트롤", "1열 파워윈도우", "매뉴얼 에어컨", "컴팩트 오디오", "2스피커", "격벽/보호봉"],
                    available_options: ["button_start", "comfort", "drive_wise", "navi_8"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 2, base_price: 1491, engine: "카파 1.0 가솔린",
                    fuel_economy: { combined: 12.9, urban: 12.2, highway: 13.8, co2: 127 },
                    standard_features: ["+맵램프", "D/N 룸미러", "선글라스 케이스", "대용량 루프콘솔", "운전석 시트 암레스트", "뒷유리 와이퍼", "스티어링 휠 오디오 리모컨", "블루투스 핸즈프리"],
                    available_options: ["button_start", "comfort", "drive_wise", "navi_8"] },
                  { trim_id: "special", name: "스페셜", seats: 2, base_price: 1521, engine: "카파 1.0 가솔린",
                    fuel_economy: { combined: 12.9, urban: 12.2, highway: 13.8, co2: 127 },
                    standard_features: ["+인조가죽시트", "앞 열선", "운전석 시트 높이조절", "시트벨트 높이조절"],
                    available_options: ["button_start", "comfort", "drive_wise", "navi_8"] }
                ],
                options_master: RAY_VAN_OPTIONS
              },
              // 1.0 가솔린 (1인승 밴)
              {
                variant_id: "van_1seat",
                variant_name: "가솔린 1.0 (밴 1인승)",
                vehicle_type: "화물(밴, 1인승)",
                fuel: "가솔린",
                displacement_cc: 998,
                transmission: "4단 자동",
                trims: [
                  { trim_id: "trendy", name: "트렌디", seats: 1, base_price: 1441, engine: "카파 1.0 가솔린",
                    fuel_economy: { combined: 12.9, urban: 12.2, highway: 13.8, co2: 127 },
                    standard_features: ["카파 1.0 가솔린 (76hp)", "4단 자동", "4에어백 (운전석 전용)", "VSM", "165/60 R14 + 풀사이즈 휠커버", "후방 주차 거리 경고", "1열 파워윈도우", "매뉴얼 에어컨", "컴팩트 오디오", "2스피커", "격벽/보호봉"],
                    available_options: ["button_start", "comfort", "drive_wise", "navi_8"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 1, base_price: 1481, engine: "카파 1.0 가솔린",
                    fuel_economy: { combined: 12.9, urban: 12.2, highway: 13.8, co2: 127 },
                    standard_features: ["+맵램프", "D/N 룸미러", "선글라스 케이스", "대용량 루프콘솔", "운전석 시트 암레스트", "뒷유리 와이퍼", "스티어링 휠 오디오 리모컨", "블루투스 핸즈프리"],
                    available_options: ["button_start", "comfort", "drive_wise", "navi_8"] },
                  { trim_id: "special", name: "스페셜", seats: 1, base_price: 1506, engine: "카파 1.0 가솔린",
                    fuel_economy: { combined: 12.9, urban: 12.2, highway: 13.8, co2: 127 },
                    standard_features: ["+인조가죽시트", "운전석 열선", "운전석 시트 높이조절", "시트벨트 높이조절"],
                    available_options: ["button_start", "comfort", "drive_wise", "navi_8"] }
                ],
                options_master: RAY_VAN_OPTIONS
              }
            ],
            exterior_colors: [
              { name: "클리어 화이트", code: "UD", hex: "#f5f4f0", price: 0 },
              { name: "오로라 블랙 펄", code: "ABP", hex: "#1a1a1a", price: 0 },
              { name: "아스트로 그레이", code: "M7G", hex: "#5d5e5f", price: 0 },
              { name: "스모크 블루", code: "EU3", hex: "#4a5b6e", price: 0 },
              { name: "아쿠아 민트", code: "AEQ", hex: "#7ec0b0", price: 0 },
              { name: "어드벤쳐러스 그린 (X-Line 제외)", code: "A2G", hex: "#5a6b54", price: 0 },
              { name: "밀키 베이지 (X-Line 제외)", code: "M9Y", hex: "#d8c9a5", price: 0 }
            ]
          };
        })(),
        
        // ========== K5 ==========
        (() => {
          // K5 공통 옵션 (자가용 HEV/가솔린 2.0/1.6T)
          // 옵션 가격은 트림별로 상이하므로 가장 일반적인 가격 박고 sub에 명시
          const K5_OPTIONS = {
            style_pkg: { name: "스타일 패키지", sub: "18\" 피렐리 휠+프로젝션 LED+LED 턴시그널+LED 리어콤비 (트림별 70~119만, 시그니처에서 블랙핏과 동시 선택 불가)", price: 109 },
            comfort: { name: "컴포트 패키지", sub: "앞좌석 파워시트+동승석 워크인+릴렉션 컴포트+뒷좌석 열선+6:4 폴딩 등 (트림별 59~99만)", price: 99 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/정면)+SCC+HDA+후측방 충돌경고+RCCA+안전하차 (트림별 45~74만, 베스트셀렉션/노블레스/시그니처 일부 기본)", price: 74 },
            builtin_cam_2: { name: "빌트인 캠 2", sub: "빌트인 캠 2+증강현실 내비 (베스트셀렉션 전용)", price: 45 },
            cluster_12_3_pack: { name: "12.3\" 클러스터 팩", sub: "12.3\"클러스터+파노라믹 커브드 디스플레이+하이패스+레인센서+풀오토 에어컨+공기청정 (프레스티지 옵션, 노블레스/시그니처 기본)", price: 104 },
            hud_builtin_cam: { name: "HUD + 빌트인 캠 2", sub: "헤드업 디스플레이+빌트인 캠 2+증강현실 내비 (프레스티지는 12.3\"클러스터 팩 필요, 노블레스/시그니처는 cluster 기본 사양)", price: 109,
              requires_in_trim: { prestige: ["cluster_12_3_pack"] } },
            krell_sound: { name: "KRELL 프리미엄 사운드", sub: "12스피커+외장앰프", price: 59 },
            smart_connect: { name: "스마트 커넥트", sub: "스마트폰 무선충전+디지털 키 2+터치 도어핸들+지문인증+스마트 파워트렁크 (트림별 30~89만, 일부 트림 기본)", price: 89 },
            black_pit: { name: "블랙 핏", sub: "전용 블랙 휠+블랙 사이드미러+다크 건메탈 스키드+전용 블랙 인테리어 (시그니처 전용, 스타일과 동시 선택 불가)", price: 89 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 109 }
          };
          
          // K5 LPG 옵션 (자가용)
          const K5_LPG_OPTIONS = {
            cluster_12_3_pack: { name: "12.3\" 클러스터 팩", sub: "12.3\"클러스터+파노라믹 커브드+풀오토 에어컨+공기청정 (프레스티지 옵션, 노블레스/시그니처 기본)", price: 119 },
            comfort: { name: "컴포트 패키지", sub: "뒷좌석 열선+높이조절 헤드레스트+센터 암레스트+스키쓰루+센서 (트림별 49~59만)", price: 59 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/정면)+SCC+HDA+후측방 충돌경고+RCCA+안전하차 (프레스티지 74만/노블레스 45만)", price: 74 },
            hud_builtin_cam: { name: "HUD + 빌트인 캠 2", sub: "헤드업 디스플레이+빌트인 캠 2+증강현실 내비 (노블레스/시그니처)", price: 109 },
            krell_sound: { name: "KRELL 프리미엄 사운드", sub: "12스피커+외장앰프 (노블레스/시그니처)", price: 59 },
            smart_connect: { name: "스마트 커넥트", sub: "스마트 파워트렁크 (노블레스 전용)", price: 30 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 109 }
          };
          
          // K5 LPG 렌터카 옵션 (간소화)
          const K5_LPG_RENT_OPTIONS = {
            comfort: { name: "컴포트", sub: "운전석 파워시트+허리지지대+가죽 스티어링+열선 스티어링+진동경고 (트렌디 전용)", price: 54 },
            sbw_pack: { name: "SBW 팩", sub: "전자식 변속 다이얼+패들 쉬프트+EPB(오토홀드)+블랙하이그로시 센터콘솔", price: 48 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/정면)+SCC+HDA+후측방경고 (SBW 팩 필요)", price: 70, requires: ["sbw_pack"] },
            cluster_12_3_pack: { name: "12.3\" 클러스터 팩", sub: "12.3\"클러스터+파노라믹 커브드+풀오토 에어컨+공기청정 (프레스티지 전용)", price: 70 },
            smart_connect: { name: "스마트 커넥트", sub: "스마트폰 무선충전+디지털 키 2+빌트인 캠 2+증강현실 내비+지문인증 (12.3인치 클러스터 팩 필요, 프레스티지 전용)", price: 103, requires: ["cluster_12_3_pack"] },
            aftermarket: { name: "애프터마켓용 컬렉션", sub: "빈차등/갓등/미터기 와이어링+PVC 카페트+프로텍션 매트 (파노라마 선루프와 동시 선택 불가)", price: 25 },
            hipass_sys: { name: "하이패스 시스템", sub: "하이패스 자동결제 (트렌디 전용)", price: 20 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 103 }
          };
          
          // 트림 표준사양
          const HEV_PRES_F = ["스마트스트림 G2.0 HEV + 38.6kW 모터", "스마트스트림 6AT", "MDPS", "FCA(차량/보행자/자전거)+LKA/LFA+HBA+DAW+ISLA", "9에어백+VSM", "205/65 R16 HEV 전용 전면가공 휠", "LED 헤드램프+DRL+보조제동등", "전자식 변속 다이얼+패들 쉬프트", "EPB(오토홀드)", "12.3\" 내비게이션", "스마트키+원격시동", "스마트 트렁크", "1열 열선/통풍", "운전석 높이조절", "터치타입 풀오토 에어컨", "공기청정", "오토디포그", "열선 스티어링"];
          const HEV_BEST_F = ["+FCA(교차/정면)+SCC+HDA+NSCC", "후측방경고+RCCA+안전하차", "프로젝션 LED 헤드램프", "블랙 스웨이드 헤드라이닝", "앞좌석 파워시트+허리지지대", "동승석 워크인+릴렉션 컴포트", "하이패스", "동승석 이지 억세스"];
          const HEV_NOB_F = ["+12.3\"클러스터+파노라믹 커브드", "터치타입 도어핸들", "215/55 R17 HEV 전면가공 휠", "인조가죽 크래시패드/도어", "우드 그레인", "운전석 파워+허리지지대", "메모리 시스템", "원격 스마트 주차 보조", "후방 주차 충돌방지", "측방 주차 거리경고", "서라운드 뷰", "후측방 모니터", "무선충전", "디지털 키 2", "지문인증"];
          const HEV_SIG_F = ["+215/55 R17 피렐리 + HEV 전면가공", "프로젝션 LED", "퀼팅 가죽시트", "동승석 파워+릴렉션 컴포트", "뒷좌석 열선", "앰비언트 라이트", "메탈 페달/도어스커프", "스마트 파워트렁크", "뒷좌석 측면 수동 선커튼", "후측방경고+RCCA+안전하차"];
          
          const G20_SMART_F = ["스마트스트림 G2.0 (160hp/20.0kgf·m)", "6AT(수동겸용)+고급형 ISG", "MDPS", "FCA+LKA/LFA+HBA+DAW+ISLA", "9에어백+VSM", "205/65 R16 알로이", "LED 헤드램프+DRL", "스마트 셀렉션 전용 디자인(범퍼/그릴)", "1열 열선/통풍", "스마트키+원격시동", "수동 풋파킹 브레이크", "후방 모니터", "12.3\" 디스플레이 오디오(내비 없음)", "매뉴얼 에어컨"];
          const G20_PRES_F = ["+215/55 R17 전면가공 휠", "전자식 변속 다이얼+패들 쉬프트", "EPB(오토홀드)", "가죽 스티어링", "ECM 룸미러", "블랙하이그로시 센터콘솔", "12.3\" 내비게이션", "열선 스티어링", "전좌석 세이프티 파워윈도우", "스티어링 휠 진동 경고"];
          const G20_BEST_F = ["+드라이브 와이즈(전체)", "프로젝션 LED", "블랙 스웨이드 헤드라이닝", "앞좌석 파워시트+허리지지대", "동승석 워크인+릴렉션 컴포트", "하이패스", "레인센서", "터치 풀오토 에어컨", "공기청정"];
          const G20_NOB_F = ["+12.3\"클러스터+파노라믹 커브드", "터치 도어핸들", "인조가죽감싸기 크래시패드/도어", "우드 그레인", "운전석 파워+허리지지대", "메모리", "원격 스마트 주차", "후방 주차 충돌방지", "서라운드 뷰", "후측방 모니터", "무선충전", "디지털 키 2", "지문인증"];
          const G20_SIG_F = ["+235/45 R18 피렐리+전면가공", "프로젝션 LED", "퀼팅 가죽시트", "동승석 파워+릴렉션 컴포트", "뒷좌석 열선", "앰비언트", "메탈 페달/도어스커프", "스마트 파워트렁크", "후측방경고+RCCA+안전하차"];
          
          const G16T_PRES_F = ["스마트스트림 G1.6 T-GDI (180hp/27.0kgf·m)", "스마트스트림 8AT", "R-MDPS+고급형 ISG", "FCA+LKA/LFA+HBA+DAW+ISLA+진동경고", "9에어백+VSM", "215/55 R17 전면가공", "LED 헤드램프+DRL", "전자식 변속 다이얼+패들 쉬프트", "EPB(오토홀드)", "12.3\" 내비게이션", "D컷 가죽 스티어링", "ECM 룸미러", "1열 열선/통풍", "터치 풀오토 에어컨(매뉴얼 아님)"];
          
          const LPG_PRES_F = ["스마트스트림 L2.0 (146hp/19.5kgf·m)", "6AT", "원형 봄베", "MDPS+진동경고", "FCA+LKA/LFA", "9에어백+VSM", "215/55 R17 전면가공", "LED 헤드램프", "전자식 변속 다이얼+EPB(오토홀드)", "12.3\" 내비게이션", "가죽 스티어링", "ECM 룸미러", "1열 열선/통풍", "열선 스티어링"];
          
          const LPG_RENT_TREN_F = ["스마트스트림 L2.0", "6AT+원형 봄베", "FCA+LKA/LFA+HBA+DAW+ISLA", "9에어백+VSM", "205/65 R16 알로이", "LED 헤드램프", "스마트키+원격시동", "스마트 트렁크", "수동 풋파킹", "1열 열선/통풍", "12.3\" 내비게이션", "매뉴얼 에어컨"];
          const LPG_RENT_PRES_F = ["+215/55 R17 전면가공 휠", "LED 리어콤비", "가죽 스티어링+ECM 룸미러", "운전석 파워+허리지지대", "뒷좌석 열선+높이조절 헤드레스트+센터 암레스트+스키쓰루", "열선 스티어링", "하이패스", "스티어링 휠 진동경고"];
          
          // 공통 충돌 (HEV/가솔린 2.0/1.6T 시그니처 트림: 스타일 ↔ 블랙핏 동시 선택 불가)
          const K5_EXCLUSIVE = [
            { id: "style_pit", label: "스타일/블랙핏", members: ["style_pkg", "black_pit"] }
          ];
          
          return {
            model_id: "k5",
            model_name: "K5",
            category: "중형 세단",
            year: 2026,
            variants: [
              // 하이브리드 (4트림)
              {
                variant_id: "hybrid_2_0",
                variant_name: "하이브리드 2.0",
                vehicle_type: "승용 (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1999,
                transmission: "스마트스트림 6AT",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 3393, base_price_3_5: 3339, engine: "G2.0 HEV (152hp + 38.6kW)",
                    fuel_economy: { combined: 19.8, urban: 19.7, highway: 19.8, co2: 79 },
                    standard_features: HEV_PRES_F,
                    available_options: ["style_pkg", "comfort", "drive_wise", "builtin_cam_2", "cluster_12_3_pack", "hud_builtin_cam", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "best_selection", name: "베스트 셀렉션", seats: 5, base_price_5: 3502, base_price_3_5: 3447, engine: "G2.0 HEV",
                    fuel_economy: { combined: 19.2, urban: 18.7, highway: 19.7, co2: 82 },
                    standard_features: HEV_BEST_F,
                    available_options: ["style_pkg", "builtin_cam_2", "smart_connect"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 3730, base_price_3_5: 3671, engine: "G2.0 HEV",
                    fuel_economy: { combined: 18.8, urban: 18.7, highway: 18.9, co2: 84 },
                    standard_features: HEV_NOB_F,
                    available_options: ["style_pkg", "comfort", "drive_wise", "hud_builtin_cam", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 4029, base_price_3_5: 3966, engine: "G2.0 HEV",
                    fuel_economy: { combined: 17.1, urban: 16.7, highway: 17.6, co2: 93 },
                    standard_features: HEV_SIG_F,
                    available_options: ["style_pkg", "comfort", "hud_builtin_cam", "krell_sound", "black_pit", "panoramic_sunroof"] }
                ],
                options_master: K5_OPTIONS,
                exclusive_groups: K5_EXCLUSIVE
              },
              // 2.0 가솔린 (5트림)
              {
                variant_id: "gasoline_2_0",
                variant_name: "가솔린 2.0",
                vehicle_type: "승용",
                fuel: "가솔린",
                displacement_cc: 1999,
                transmission: "6단 자동",
                trims: [
                  { trim_id: "smart_selection", name: "스마트 셀렉션", seats: 5, base_price_5: 2766, base_price_3_5: 2724, engine: "스마트스트림 G2.0 (160hp)",
                    fuel_economy: { combined: 12.6, urban: 11.2, highway: 14.7, co2: 132 },
                    standard_features: G20_SMART_F,
                    available_options: ["cluster_12_3_pack", "drive_wise", "panoramic_sunroof"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 2851, base_price_3_5: 2808, engine: "스마트스트림 G2.0",
                    fuel_economy: { combined: 12.6, urban: 11.2, highway: 14.7, co2: 132 },
                    standard_features: G20_PRES_F,
                    available_options: ["style_pkg", "comfort", "drive_wise", "builtin_cam_2", "cluster_12_3_pack", "hud_builtin_cam", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "best_selection", name: "베스트 셀렉션", seats: 5, base_price_5: 2973, base_price_3_5: 2928, engine: "스마트스트림 G2.0",
                    fuel_economy: { combined: 12.3, urban: 10.9, highway: 14.5, co2: 135 },
                    standard_features: G20_BEST_F,
                    available_options: ["style_pkg", "builtin_cam_2", "smart_connect"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 3203, base_price_3_5: 3154, engine: "스마트스트림 G2.0",
                    fuel_economy: { combined: 12.3, urban: 10.9, highway: 14.5, co2: 135 },
                    standard_features: G20_NOB_F,
                    available_options: ["style_pkg", "comfort", "drive_wise", "hud_builtin_cam", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 3522, base_price_3_5: 3469, engine: "스마트스트림 G2.0",
                    fuel_economy: { combined: 12.2, urban: 10.9, highway: 14.1, co2: 137 },
                    standard_features: G20_SIG_F,
                    available_options: ["style_pkg", "comfort", "hud_builtin_cam", "krell_sound", "black_pit", "panoramic_sunroof"] }
                ],
                options_master: K5_OPTIONS,
                exclusive_groups: K5_EXCLUSIVE
              },
              // 1.6 가솔린 터보 (4트림)
              {
                variant_id: "gasoline_1_6t",
                variant_name: "가솔린 1.6 터보",
                vehicle_type: "승용",
                fuel: "가솔린",
                displacement_cc: 1598,
                transmission: "스마트스트림 8단 자동",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 2932, base_price_3_5: 2887, engine: "G1.6 T-GDI (180hp/27.0kgf·m)",
                    fuel_economy: { combined: 13.7, urban: 12.1, highway: 16.1, co2: 121 },
                    standard_features: G16T_PRES_F,
                    available_options: ["style_pkg", "comfort", "drive_wise", "builtin_cam_2", "cluster_12_3_pack", "hud_builtin_cam", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "best_selection", name: "베스트 셀렉션", seats: 5, base_price_5: 3054, base_price_3_5: 3008, engine: "G1.6 T-GDI",
                    fuel_economy: { combined: 13.5, urban: 11.9, highway: 16.0, co2: 123 },
                    standard_features: ["+FCA(교차/정면)+SCC+HDA+NSCC", "후측방경고+RCCA+안전하차", "프로젝션 LED 헤드램프", "블랙 스웨이드 헤드라이닝", "앞좌석 파워시트+허리지지대", "동승석 워크인+릴렉션 컴포트", "하이패스", "레인센서", "터치 풀오토", "공기청정"],
                    available_options: ["style_pkg", "builtin_cam_2", "smart_connect"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 3327, base_price_3_5: 3276, engine: "G1.6 T-GDI",
                    fuel_economy: { combined: 13.0, urban: 11.5, highway: 15.4, co2: 128 },
                    standard_features: ["+235/45 R18 피렐리+전면가공", "+12.3\"클러스터+파노라믹 커브드", "터치 도어핸들", "운전석 파워+허리지지대", "메모리", "원격 스마트 주차", "서라운드 뷰", "후측방 모니터", "무선충전", "디지털 키 2", "지문인증", "우드 그레인"],
                    available_options: ["style_pkg", "comfort", "drive_wise", "hud_builtin_cam", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 3601, base_price_3_5: 3546, engine: "G1.6 T-GDI",
                    fuel_economy: { combined: 12.3, urban: 10.8, highway: 14.9, co2: 135 },
                    standard_features: ["+245/40 R19 피렐리+전면가공", "프로젝션 LED", "퀼팅 가죽시트", "동승석 파워+릴렉션 컴포트", "뒷좌석 열선", "앰비언트", "메탈 페달/도어스커프", "스마트 파워트렁크", "후측방경고+RCCA+안전하차"],
                    available_options: ["style_pkg", "comfort", "hud_builtin_cam", "krell_sound", "black_pit", "panoramic_sunroof"] }
                ],
                options_master: K5_OPTIONS,
                exclusive_groups: K5_EXCLUSIVE
              },
              // 2.0 LPG 자가용 (3트림)
              {
                variant_id: "lpg_2_0",
                variant_name: "LPG 2.0 (자가용)",
                vehicle_type: "승용 (LPG)",
                fuel: "LPG",
                displacement_cc: 1999,
                transmission: "6단 자동",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 2920, base_price_3_5: 2876, engine: "L2.0 (146hp/19.5kgf·m)",
                    fuel_economy: { combined: 9.8, urban: 8.5, highway: 11.8, co2: 133 },
                    standard_features: LPG_PRES_F,
                    available_options: ["cluster_12_3_pack", "drive_wise", "panoramic_sunroof"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 3282, base_price_3_5: 3232, engine: "L2.0",
                    fuel_economy: { combined: 9.8, urban: 8.5, highway: 11.8, co2: 133 },
                    standard_features: ["+12.3\"클러스터+파노라믹 커브드", "터치 도어핸들", "LED 리어콤비", "인조가죽감싸기", "우드 그레인", "앞좌석 파워+허리지지대", "메모리", "원격 스마트 주차", "후방 주차 충돌방지", "측방 주차 경고", "서라운드 뷰", "후측방 모니터", "무선충전", "디지털 키 2", "지문인증"],
                    available_options: ["comfort", "drive_wise", "hud_builtin_cam", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 3537, base_price_3_5: 3483, engine: "L2.0",
                    fuel_economy: { combined: 9.5, urban: 8.2, highway: 11.5, co2: 138 },
                    standard_features: ["+235/45 R18 전면가공", "프로젝션 LED", "퀼팅 가죽시트", "뒷좌석 열선", "앰비언트", "메탈 도어스커프", "스마트 파워트렁크", "후측방경고+RCCA+안전하차"],
                    available_options: ["comfort", "hud_builtin_cam", "krell_sound", "panoramic_sunroof"] }
                ],
                options_master: K5_LPG_OPTIONS
              },
              // 2.0 LPG 렌터카 (2트림)
              {
                variant_id: "lpg_2_0_rent",
                variant_name: "LPG 2.0 (렌터카)",
                vehicle_type: "승용 (LPG/렌터카)",
                fuel: "LPG",
                displacement_cc: 1999,
                transmission: "6단 자동",
                trims: [
                  { trim_id: "trendy", name: "트렌디", seats: 5, base_price_5: 2507, base_price_3_5: 2507, engine: "L2.0",
                    fuel_economy: { combined: 9.8, urban: 8.5, highway: 11.8, co2: 133 },
                    standard_features: LPG_RENT_TREN_F,
                    available_options: ["comfort", "sbw_pack", "drive_wise", "aftermarket", "hipass_sys", "panoramic_sunroof"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 2774, base_price_3_5: 2774, engine: "L2.0",
                    fuel_economy: { combined: 9.8, urban: 8.5, highway: 11.8, co2: 133 },
                    standard_features: LPG_RENT_PRES_F,
                    available_options: ["sbw_pack", "drive_wise", "cluster_12_3_pack", "smart_connect", "aftermarket", "panoramic_sunroof"] }
                ],
                options_master: K5_LPG_RENT_OPTIONS,
                // 애프터마켓용 컬렉션과 파노라마 선루프 동시 선택 불가 (가격표 명시)
                exclusive_groups: [
                  { id: "aftermarket_or_sunroof", label: "애프터마켓/선루프", members: ["aftermarket", "panoramic_sunroof"] }
                ]
              }
            ],
            exterior_colors: [
              { name: "스노우 화이트 펄", code: "SWP", hex: "#f7f5f0", price: 8 },
              { name: "인터스텔라 그레이", code: "AGT", hex: "#5d5e5f", price: 0 },
              { name: "오로라 블랙 펄", code: "ABP", hex: "#1a1a1a", price: 0 },
              { name: "그래비티 블루 (2.0 가솔린/LPG)", code: "B4U", hex: "#2a3a55", price: 0 },
              { name: "글래시어 (2.0 가솔린 스마트 셀렉션 전용)", code: "GLB", hex: "#a8b8c5", price: 0 },
              { name: "요트 블루 (1.6T 전용)", code: "DU3", hex: "#3a5070", price: 0 },
              { name: "문스케이프 매트 그레이 (무광, 1.6T 전용)", code: "KLM", hex: "#4a4d50", price: 30 },
              { name: "울프 그레이", code: "C7S", hex: "#7a7a78", price: 0 }
            ]
          };
        })(),
        
        // ========== K8 ==========
        (() => {
          // K8 자가용 공통 옵션 (HEV/2.5G/3.5G)
          const K8_OPTIONS = {
            panoramic_sunroof: { name: "파노라마 선루프", price: 109 },
            hud: { name: "헤드업 디스플레이", sub: "(시그니처 이상 기본)", price: 84 },
            preview_susp_1: { name: "프리뷰 전자제어 서스펜션 Ⅰ", sub: "245/40 R19 미쉐린 휠 + 프리뷰 서스펜션", price: 109 },
            preview_susp_2: { name: "프리뷰 전자제어 서스펜션 Ⅱ", sub: "245/40 R20 피렐리 휠 + 프리뷰 서스펜션 (2.5G/3.5G 전용)", price: 129 },
            meridian_sound: { name: "메리디안 프리미엄 사운드", sub: "14스피커+외장앰프+액티브 로드 노이즈 컨트롤", price: 109 },
            style_pkg: { name: "스타일 패키지", sub: "순차점등 LED 턴시그널+IFS+다이내믹 앰비언트+웰컴 라이트+19\"휠+우드그레인 (베스트셀렉션/노블레스에 프리뷰 서스 포함, 트림별 64~198만)", price: 178 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+HDA2+안전하차 (베스트셀렉션 일부+노블레스 이상 기본, 트림별 64~109만)", price: 109 },
            premium: { name: "프리미엄", sub: "후면 전동 선커튼+뒷좌석 다기능 암레스트+에어컨 광촉매+3존 공조+뒷좌석 통풍(2.5G/3.5G)", price: 69 },
            smart_connect: { name: "스마트 커넥트", sub: "빌트인 캠 2+증강현실 내비+지문 인증 (시그니처 이상 기본)", price: 54 },
            awd: { name: "AWD (3.5G 전용)", sub: "4륜구동 + 험로주행", price: 218 }
          };
          
          // K8 자가용 배타/포함
          const K8_EXCLUSIVE = [
            { id: "preview_susp", label: "프리뷰 서스펜션", members: ["preview_susp_1", "preview_susp_2"] }
          ];
          const K8_EXCLUDES = {
            "style_pkg": ["preview_susp_1", "preview_susp_2"]  // 스타일에 프리뷰 서스 포함 (베스트셀렉션/노블레스/시그니처)
          };
          
          // K8 LPG 자가용 옵션
          const K8_LPG_OPTIONS = {
            panoramic_sunroof: { name: "파노라마 선루프", price: 109 },
            wheel_18_pack: { name: "전자식 룸미러 + 하이패스 + 18\" 휠", sub: "245/45 R18 전면가공 휠 + 전자식 룸미러 + 하이패스 (프레스티지 전용)", price: 59 },
            comfort: { name: "컴포트", sub: "운전석 에르고모션+릴렉션+익스텐션+메모리+무선충전 듀얼+전동 틸트/텔레스코픽 (프레스티지 전용)", price: 104 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+HDA2+안전하차", price: 109 },
            meridian_sound: { name: "메리디안 프리미엄 사운드", sub: "14스피커+외장앰프 (노블레스 전용)", price: 109 },
            convenience: { name: "컨비니언스", sub: "서라운드 뷰+후측방 모니터+원격 스마트 주차+3존 공조+뒷좌석 통풍 (노블레스 전용)", price: 178 },
            style_pkg: { name: "스타일 패키지", sub: "순차점등+IFS+다이내믹 앰비언트+웰컴 라이트+우드그레인 (노블레스 전용)", price: 168 },
            hud_smart_connect: { name: "HUD + 스마트 커넥트", sub: "HUD+빌트인 캠 2+AR 내비+지문 인증+디지털 키 2+터치 도어핸들 (노블레스 전용)", price: 178 }
          };
          
          // K8 LPG 렌터카 옵션 (가격만 약간 다름)
          const K8_LPG_RENT_OPTIONS = {
            panoramic_sunroof: { name: "파노라마 선루프", price: 103 },
            comfort_rent: { name: "컴포트 + 룸미러 + 하이패스", sub: "운전석 에르고모션+릴렉션+익스텐션+메모리+무선충전+전자식 룸미러+하이패스 (프레스티지 전용)", price: 122 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+HDA2+안전하차", price: 103 },
            meridian_sound: { name: "메리디안 프리미엄 사운드", sub: "14스피커+외장앰프 (노블레스 전용)", price: 103 },
            convenience: { name: "컨비니언스", sub: "서라운드 뷰+후측방 모니터+원격 스마트 주차+3존 공조+뒷좌석 통풍 (노블레스 전용)", price: 169 },
            style_pkg: { name: "스타일 패키지", sub: "순차점등+IFS+다이내믹 앰비언트+웰컴 라이트+우드그레인 (노블레스 전용)", price: 160 },
            hud_smart_connect: { name: "HUD + 스마트 커넥트", sub: "HUD+빌트인 캠 2+AR 내비+지문 인증+디지털 키 2+터치 도어핸들 (노블레스 전용)", price: 169 }
          };
          
          // 트림 표준사양
          const K8_HEV_NOB_LITE_F = ["스마트스트림 1.6T HEV (180hp 추정) + 47.7kW 모터", "스마트스트림 6AT", "R-MDPS", "FCA(교차/정면)+LKA2+LFA+HBA+DAW+ISLA+SCC+HDA+NSCC+그립감지", "10에어백+VSM+다중 충돌방지", "225/55 R17 HEV 전용 전면가공", "프로젝션 LED 헤드램프+스타맵 시그니처(센터 포지셔닝)", "Full LED 외관", "12.3\"클러스터+파노라믹 커브드", "12.3\" 내비게이션+8스피커", "가죽시트", "앞좌석 파워+허리지지대", "1열 통풍+1/2열 열선", "동승석 워크인", "EPB(오토홀드)", "전자식 변속 다이얼", "하이패스", "터치 풀오토 에어컨", "공기청정"];
          const K8_HEV_BEST_F = ["+후측방 충돌방지(전진/주행)+RCCA+안전하차", "후방 주차 충돌방지", "측방 주차 거리경고", "245/45 R18 전면가공", "다이내믹 앰비언트", "스웨이드 헤드라이닝/필라", "동승석 통풍시트", "서라운드 뷰", "후측방 모니터", "원격 스마트 주차", "스마트폰 무선충전(듀얼)", "스마트 파워트렁크"];
          const K8_HEV_NOB_F = ["+FCA(교차/측방/추월/회피)+SCC(연동)+HDA2(차로변경)", "후석 승객 알림(센서)", "측방 주차 경고+후방 주차 충돌방지", "245/45 R18 전면가공", "새틴 크롬+블랙 스테인리스 몰딩", "터치 도어핸들", "앞좌석 에르고 모션+릴렉션 컴포트", "운전석 익스텐션", "동승석 통풍+전동 높이조절", "디지털 키 2", "전동 틸트/텔레스코픽 스티어링", "메모리+이지억세스", "뒷좌석 측면 수동 선커튼"];
          const K8_HEV_SIG_F = ["+순차점등 LED 턴시그널+IFS+다이내믹 웰컴/에스코트", "후진 가이드", "앞좌석 발수 글라스", "딥씨 네이비 인테리어 옵션", "다이내믹 앰비언트", "스웨이드", "메탈 페달", "퀼팅 나파가죽시트", "옷걸이형 헤드레스트", "헤드업 디스플레이", "양문형 콘솔암레스트", "빌트인 캠 2+AR 내비", "지문인증"];
          const K8_HEV_SIG_BLK_F = ["+프리뷰 전자제어 서스펜션 기본", "245/40 R19 미쉐린 + 전용 블랙 휠", "블랙 엠블럼", "시그니처 블랙 전용 컬러", "외장: 인터스텔라 그레이 / 내장: 딥씨 네이비 단일"];
          
          const K8_G25_NOB_LITE_F = ["스마트스트림 G2.5 GDI", "8AT", "R-MDPS", "FCA(교차/정면)+LKA2+LFA+HBA+DAW+ISLA+SCC+HDA+NSCC+그립감지", "10에어백+VSM+다중 충돌방지", "225/55 R17 알로이", "프로젝션 LED+스타맵 시그니처", "12.3\"클러스터+파노라믹 커브드", "12.3\" 내비게이션+8스피커", "가죽시트", "앞좌석 파워+허리지지대", "1열 통풍+1/2열 열선", "EPB(오토홀드)", "전자식 변속 다이얼", "하이패스", "터치 풀오토 에어컨"];
          const K8_G35_NOB_LITE_F = ["스마트스트림 G3.5 GDI", "8AT", "R-MDPS", "FCA(교차/정면)+LKA2+LFA+HBA+DAW+ISLA+SCC+HDA+NSCC+그립감지", "10에어백+VSM+다중 충돌방지", "245/45 R18 전면가공", "프로젝션 LED+스타맵 시그니처", "12.3\"클러스터+파노라믹 커브드", "12.3\" 내비게이션+8스피커", "가죽시트", "앞좌석 파워+허리지지대", "1열 통풍+1/2열 열선", "EPB(오토홀드)", "전자식 변속 다이얼", "하이패스"];
          
          const K8_LPG_PRES_F = ["스마트스트림 L3.5 + 원형 봄베", "8AT", "R-MDPS", "FCA(교차/정면)+LKA2+SCC+HDA+NSCC+그립감지", "10에어백+VSM+다중 충돌방지", "225/55 R17 알로이", "프로젝션 LED+스타맵 시그니처", "12.3\"클러스터+파노라믹 커브드", "12.3\" 내비게이션+8스피커", "가죽시트", "앞좌석 파워+허리지지대", "1열 통풍+1/2열 열선", "EPB(오토홀드)+전자식 변속 다이얼", "터치 풀오토 에어컨"];
          const K8_LPG_NOB_F = ["+245/45 R18 전면가공", "전자식 룸미러", "앞좌석 에르고모션+릴렉션 컴포트", "운전석 익스텐션", "동승석 통풍+워크인+전동 허리지지대+전동 높이조절", "뒷좌석 다기능 센터 암레스트", "하이패스", "스마트폰 무선충전 듀얼", "전동 틸트/텔레스코픽", "메모리+이지억세스", "뒷좌석 수동 선커튼+후면 전동 선커튼"];
          
          return {
            model_id: "k8",
            model_name: "K8",
            category: "준대형 세단",
            year: 2026,
            variants: [
              // 1.6 터보 하이브리드 (5트림)
              {
                variant_id: "hybrid_1_6t",
                variant_name: "터보 하이브리드 1.6",
                vehicle_type: "승용 (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1598,
                transmission: "스마트스트림 6AT",
                trims: [
                  { trim_id: "noblesse_lite", name: "노블레스 라이트", seats: 5, base_price_5: 4372, base_price_3_5: 4304, engine: "1.6T HEV + 47.7kW 모터",
                    fuel_economy: { combined: 17.0, urban: 17.5, highway: 16.3, co2: 95 },
                    standard_features: K8_HEV_NOB_LITE_F,
                    available_options: ["panoramic_sunroof", "hud", "preview_susp_1", "meridian_sound", "style_pkg", "drive_wise"] },
                  { trim_id: "best_selection", name: "베스트 셀렉션", seats: 5, base_price_5: 4508, base_price_3_5: 4438, engine: "1.6T HEV",
                    fuel_economy: { combined: 16.5, urban: 17.0, highway: 15.8, co2: 98 },
                    standard_features: K8_HEV_BEST_F,
                    available_options: ["panoramic_sunroof", "hud", "style_pkg", "drive_wise", "smart_connect"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 4724, base_price_3_5: 4650, engine: "1.6T HEV",
                    fuel_economy: { combined: 16.0, urban: 16.5, highway: 15.3, co2: 101 },
                    standard_features: K8_HEV_NOB_F,
                    available_options: ["panoramic_sunroof", "hud", "meridian_sound", "style_pkg", "premium", "smart_connect"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 5094, base_price_3_5: 5015, engine: "1.6T HEV",
                    fuel_economy: { combined: 15.8, urban: 16.2, highway: 15.1, co2: 103 },
                    standard_features: K8_HEV_SIG_F,
                    available_options: ["panoramic_sunroof", "preview_susp_1", "meridian_sound", "premium"] },
                  { trim_id: "signature_black", name: "시그니처 블랙", seats: 5, base_price_5: 5232, base_price_3_5: 5151, engine: "1.6T HEV",
                    fuel_economy: { combined: 15.5, urban: 15.9, highway: 14.8, co2: 105 },
                    standard_features: K8_HEV_SIG_BLK_F,
                    available_options: ["panoramic_sunroof", "meridian_sound", "premium"] }
                ],
                options_master: K8_OPTIONS,
                exclusive_groups: K8_EXCLUSIVE,
                option_excludes: K8_EXCLUDES
              },
              // 2.5 가솔린 (5트림)
              {
                variant_id: "gasoline_2_5",
                variant_name: "가솔린 2.5",
                vehicle_type: "승용",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "noblesse_lite", name: "노블레스 라이트", seats: 5, base_price_5: 3736, base_price_3_5: 3679, engine: "G2.5 GDI",
                    fuel_economy: { combined: 11.7, urban: 10.0, highway: 14.4, co2: 144 },
                    standard_features: K8_G25_NOB_LITE_F,
                    available_options: ["panoramic_sunroof", "hud", "preview_susp_1", "preview_susp_2", "meridian_sound", "style_pkg", "drive_wise"] },
                  { trim_id: "best_selection", name: "베스트 셀렉션", seats: 5, base_price_5: 3872, base_price_3_5: 3813, engine: "G2.5 GDI",
                    fuel_economy: { combined: 11.4, urban: 9.8, highway: 14.1, co2: 148 },
                    standard_features: ["+후측방 충돌방지+RCCA+안전하차", "245/45 R18 전면가공", "스웨이드 헤드라이닝", "동승석 통풍시트", "서라운드 뷰+후측방 모니터", "원격 스마트 주차", "스마트폰 무선충전 듀얼", "스마트 파워트렁크"],
                    available_options: ["panoramic_sunroof", "hud", "style_pkg", "drive_wise", "smart_connect"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 4088, base_price_3_5: 4026, engine: "G2.5 GDI",
                    fuel_economy: { combined: 11.0, urban: 9.5, highway: 13.7, co2: 152 },
                    standard_features: ["+FCA(교차/측방/추월/회피)+HDA2", "245/45 R18 전면가공", "새틴 크롬", "터치 도어핸들", "에르고 모션+릴렉션", "디지털 키 2", "메모리+이지억세스"],
                    available_options: ["panoramic_sunroof", "hud", "meridian_sound", "style_pkg", "premium", "smart_connect"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 4458, base_price_3_5: 4391, engine: "G2.5 GDI",
                    fuel_economy: { combined: 10.8, urban: 9.3, highway: 13.4, co2: 155 },
                    standard_features: ["+순차점등+IFS+다이내믹 웰컴/에스코트", "딥씨 네이비 옵션", "퀼팅 나파가죽시트", "헤드업 디스플레이", "양문형 콘솔암레스트", "빌트인 캠 2+AR", "지문인증"],
                    available_options: ["panoramic_sunroof", "preview_susp_1", "preview_susp_2", "meridian_sound", "premium"] },
                  { trim_id: "signature_black", name: "시그니처 블랙", seats: 5, base_price_5: 4616, base_price_3_5: 4546, engine: "G2.5 GDI",
                    fuel_economy: { combined: 10.5, urban: 9.1, highway: 13.0, co2: 159 },
                    standard_features: ["+프리뷰 전자제어 서스펜션 기본", "245/40 R20 피렐리 + 전용 블랙 휠", "블랙 엠블럼", "외장: 인터스텔라 그레이 / 내장: 딥씨 네이비 단일"],
                    available_options: ["panoramic_sunroof", "meridian_sound", "premium"] }
                ],
                options_master: K8_OPTIONS,
                exclusive_groups: K8_EXCLUSIVE,
                option_excludes: K8_EXCLUDES
              },
              // 3.5 가솔린 (5트림, AWD 옵션)
              {
                variant_id: "gasoline_3_5",
                variant_name: "가솔린 3.5",
                vehicle_type: "승용",
                fuel: "가솔린",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "noblesse_lite", name: "노블레스 라이트", seats: 5, base_price_5: 4048, base_price_3_5: 3987, engine: "G3.5 GDI",
                    fuel_economy: { combined: 10.3, urban: 8.6, highway: 13.0, co2: 163 },
                    standard_features: K8_G35_NOB_LITE_F,
                    available_options: ["panoramic_sunroof", "hud", "preview_susp_1", "preview_susp_2", "meridian_sound", "awd", "style_pkg", "drive_wise"] },
                  { trim_id: "best_selection", name: "베스트 셀렉션", seats: 5, base_price_5: 4159, base_price_3_5: 4096, engine: "G3.5 GDI",
                    fuel_economy: { combined: 10.0, urban: 8.4, highway: 12.7, co2: 167 },
                    standard_features: ["+후측방 충돌방지+RCCA+안전하차", "스웨이드 헤드라이닝", "동승석 통풍시트", "서라운드 뷰+후측방 모니터", "원격 스마트 주차", "스마트폰 무선충전 듀얼", "스마트 파워트렁크"],
                    available_options: ["panoramic_sunroof", "hud", "style_pkg", "drive_wise", "smart_connect"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 4375, base_price_3_5: 4309, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.7, urban: 8.2, highway: 12.3, co2: 172 },
                    standard_features: ["+FCA(교차/측방/추월/회피)+HDA2", "새틴 크롬", "터치 도어핸들", "에르고 모션+릴렉션", "디지털 키 2", "메모리+이지억세스"],
                    available_options: ["panoramic_sunroof", "hud", "meridian_sound", "awd", "style_pkg", "premium", "smart_connect"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 4745, base_price_3_5: 4673, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.5, urban: 8.0, highway: 12.0, co2: 176 },
                    standard_features: ["+순차점등+IFS+다이내믹 웰컴/에스코트", "딥씨 네이비 옵션", "퀼팅 나파가죽시트", "헤드업 디스플레이", "양문형 콘솔암레스트", "빌트인 캠 2+AR", "지문인증"],
                    available_options: ["panoramic_sunroof", "preview_susp_1", "preview_susp_2", "meridian_sound", "awd", "premium"] },
                  { trim_id: "signature_black", name: "시그니처 블랙", seats: 5, base_price_5: 4903, base_price_3_5: 4829, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.2, urban: 7.8, highway: 11.7, co2: 181 },
                    standard_features: ["+프리뷰 전자제어 서스펜션 기본", "245/40 R20 피렐리 + 전용 블랙 휠", "블랙 엠블럼", "외장: 인터스텔라 그레이 / 내장: 딥씨 네이비 단일"],
                    available_options: ["panoramic_sunroof", "meridian_sound", "awd", "premium"] }
                ],
                options_master: K8_OPTIONS,
                exclusive_groups: K8_EXCLUSIVE,
                option_excludes: K8_EXCLUDES
              },
              // 3.5 LPG 자가용 (2트림)
              {
                variant_id: "lpg_3_5",
                variant_name: "LPG 3.5 (자가용)",
                vehicle_type: "승용 (LPG)",
                fuel: "LPG",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 3782, base_price_3_5: 3725, engine: "L3.5",
                    fuel_economy: { combined: 7.8, urban: 6.6, highway: 9.7, co2: 192 },
                    standard_features: K8_LPG_PRES_F,
                    available_options: ["panoramic_sunroof", "wheel_18_pack", "comfort", "drive_wise"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 4166, base_price_3_5: 4103, engine: "L3.5",
                    fuel_economy: { combined: 7.6, urban: 6.4, highway: 9.5, co2: 196 },
                    standard_features: K8_LPG_NOB_F,
                    available_options: ["panoramic_sunroof", "meridian_sound", "drive_wise", "convenience", "style_pkg", "hud_smart_connect"] }
                ],
                options_master: K8_LPG_OPTIONS
              },
              // 3.5 LPG 렌터카 (2트림)
              {
                variant_id: "lpg_3_5_rent",
                variant_name: "LPG 3.5 (렌터카)",
                vehicle_type: "승용 (LPG/렌터카)",
                fuel: "LPG",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 3591, base_price_3_5: 3591, engine: "L3.5",
                    fuel_economy: { combined: 7.8, urban: 6.6, highway: 9.7, co2: 192 },
                    standard_features: K8_LPG_PRES_F,
                    available_options: ["panoramic_sunroof", "comfort_rent", "drive_wise"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 3955, base_price_3_5: 3955, engine: "L3.5",
                    fuel_economy: { combined: 7.6, urban: 6.4, highway: 9.5, co2: 196 },
                    standard_features: K8_LPG_NOB_F,
                    available_options: ["panoramic_sunroof", "meridian_sound", "drive_wise", "convenience", "style_pkg", "hud_smart_connect"] }
                ],
                options_master: K8_LPG_RENT_OPTIONS
              }
            ],
            exterior_colors: [
              { name: "스노우 화이트 펄", code: "SWP", hex: "#f7f5f0", price: 8 },
              { name: "아이보리 실버", code: "ISG", hex: "#dcd6c5", price: 0 },
              { name: "문스케이프 매트 그레이 (무광)", code: "KLM", hex: "#4a4d50", price: 40 },
              { name: "선셋 베이지 (가솔린/HEV 전용)", code: "BYG", hex: "#bda88a", price: 0 },
              { name: "인터스텔라 그레이", code: "AGT", hex: "#5d5e5f", price: 0 },
              { name: "오로라 블랙 펄", code: "ABP", hex: "#1a1a1a", price: 0 }
            ]
          };
        })(),
        
        // ========== 셀토스 ==========
        (() => {
          // 셀토스 가솔린 1.6T 옵션
          const SELTOS_GAS_OPTIONS = {
            electric_4wd: { name: "전자식 4WD", sub: "터레인 모드(스노우/머드/샌드)+후륜 멀티링크 (트렌디는 스타일 패키지 적용 필요)", price: 198 },
            style_pkg: { name: "스타일 패키지", sub: "프로젝션 LED 헤드램프+LED 턴시그널+다이내믹 웰컴+프리미엄 DRL+포그램프+18\"휠 (트렌디 109만/프레스티지·시그니처 89만 - 235/45 R19, X-Line 기본)", price: 89 },
            convenience: { name: "컨비니언스", sub: "프리미엄 바이오 인조가죽시트+1열 통풍+시트백 포켓+하이패스 (트렌디 옵션, 그 외 기본)", price: 64 },
            navi_12_3: { name: "12.3\" 내비게이션", sub: "파노라믹 와이드 디스플레이+NSCC+HDA+컬럼타입 변속+무선충전+레인센서+풀오토 에어컨+공기청정+AI 어시스턴트 (트렌디 옵션, 그 외 기본)", price: 109 },
            builtin_cam_2_plus: { name: "빌트인 캠 2 플러스", sub: "빌트인캠 2 플러스+증강현실 내비 (트렌디는 12.3\"내비 필요)", price: 45,
              requires_in_trim: { trendy: ["navi_12_3"] } },
            cluster_12_3: { name: "12.3\" 클러스터", sub: "슈퍼비전 클러스터 (트렌디/프레스티지 40만, 시그니처/X-Line 기본, 트렌디는 12.3\"내비 필요)", price: 40,
              requires_in_trim: { trendy: ["navi_12_3"] } },
            smart_connect: { name: "스마트 커넥트", sub: "오토 플러시 도어핸들+디지털 키 2+100W USB (시그니처/X-Line 기본, 프레스티지는 12.3\"클러스터 필요)", price: 69,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+HDA2+안전하차+전방주시 카메라 (트렌디/프레스티지 119만, 시그니처/X-Line 79만, 프레스티지는 12.3\"클러스터 필요)", price: 119,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            monitoring: { name: "모니터링", sub: "서라운드 뷰+후측방 모니터+리모트 360도+측방 주차 경고+후방 주차 충돌방지+원격 스마트 주차 (프레스티지는 12.3\"클러스터 필요)", price: 104,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            hud: { name: "헤드업 디스플레이", sub: "(프레스티지는 12.3\"클러스터 필요)", price: 59,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            comfort: { name: "컴포트", sub: "1열 이중접합 차음+앰비언트+동승석 파워시트+2열 열선+슬라이딩 컵홀더+2열 에어벤트+스마트 파워테일게이트 (프레스티지는 12.3\"클러스터 필요, 하만카돈과 동시 선택 불가)", price: 104,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            harman_kardon: { name: "하만카돈 프리미엄 사운드", sub: "8스피커+외장앰프+바이브로 사운드 시트 (프레스티지는 12.3\"클러스터 필요, 컴포트와 동시 선택 불가)", price: 89,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            panoramic_sunroof: { name: "파노라마 선루프", sub: "+ 니트 헤드라이닝 (시그니처/X-Line 109만, 투톤 루프와 동시 선택 불가)", price: 109 },
            two_tone_roof: { name: "투톤 루프", sub: "(시그니처/X-Line 전용, 파노라마 선루프와 동시 선택 불가)", price: 30 }
          };
          
          // 셀토스 HEV 옵션 (4WD 제외 + 실내 V2L 추가)
          const SELTOS_HEV_OPTIONS = {
            style_pkg: { name: "스타일 패키지", sub: "프로젝션 LED 헤드램프+LED 턴시그널+다이내믹 웰컴+프리미엄 DRL+포그램프+18\"휠 (트렌디 109만/프레스티지·시그니처 89만, X-Line 기본)", price: 89 },
            convenience: { name: "컨비니언스", sub: "프리미엄 바이오 인조가죽시트+1열 통풍+시트백 포켓+하이패스 (트렌디 옵션, 그 외 기본)", price: 64 },
            navi_12_3: { name: "12.3\" 내비게이션", sub: "12.3\"내비+NSCC+HDA+무선충전+레인센서+AI 어시스턴트 (트렌디 옵션, 그 외 기본)", price: 54 },
            builtin_cam_2_plus: { name: "빌트인 캠 2 플러스", sub: "빌트인캠 2 플러스+증강현실 내비 (트렌디는 12.3\"내비 필요)", price: 45,
              requires_in_trim: { trendy: ["navi_12_3"] } },
            cluster_12_3: { name: "12.3\" 클러스터", sub: "슈퍼비전 클러스터 (트렌디는 12.3\"내비 필요)", price: 40,
              requires_in_trim: { trendy: ["navi_12_3"] } },
            smart_connect: { name: "스마트 커넥트", sub: "오토 플러시 도어핸들+디지털 키 2+100W USB (프레스티지는 12.3\"클러스터 필요, 시그니처/X-Line 기본)", price: 69,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+HDA2+안전하차+전방주시 카메라 (프레스티지는 12.3\"클러스터 필요)", price: 119,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            monitoring: { name: "모니터링", sub: "서라운드 뷰+후측방 모니터+리모트 360도+측방 주차 경고+후방 주차 충돌방지+원격 스마트 주차 (프레스티지는 12.3\"클러스터 필요)", price: 104,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            hud: { name: "헤드업 디스플레이", sub: "(프레스티지는 12.3\"클러스터 필요)", price: 59,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            comfort: { name: "컴포트", sub: "1열 이중접합 차음+앰비언트+동승석 파워시트+2열 열선+슬라이딩 컵홀더+2열 에어벤트+스마트 파워테일게이트 (프레스티지는 12.3\"클러스터 필요, 하만카돈과 동시 선택 불가)", price: 104,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            harman_kardon: { name: "하만카돈 프리미엄 사운드", sub: "8스피커+외장앰프+바이브로 사운드 시트 (프레스티지는 12.3\"클러스터 필요, 컴포트와 동시 선택 불가)", price: 89,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            v2l_indoor: { name: "실내 V2L", sub: "실내 V2L 콘센트+러기지 언더트레이 (프레스티지는 12.3\"클러스터 필요, 하이브리드 전용)", price: 69,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            panoramic_sunroof: { name: "파노라마 선루프", sub: "+ 니트 헤드라이닝 (투톤 루프와 동시 선택 불가)", price: 109 },
            two_tone_roof: { name: "투톤 루프", sub: "(파노라마 선루프와 동시 선택 불가)", price: 30 }
          };
          
          // 셀토스 공통 배타/포함
          const SELTOS_EXCLUSIVE_COMMON = [
            { id: "roof", label: "루프 옵션", members: ["panoramic_sunroof", "two_tone_roof"] },
            { id: "comfort_audio", label: "컴포트/사운드", members: ["comfort", "harman_kardon"] }
          ];
          // 가솔린 1.6T 옵션은 4WD가 스타일 패키지 필요 (트렌디에서)
          const SELTOS_GAS_EXCLUDES = {
            "style_pkg": []  // 빈 객체로 명시는 안 함. requires로 처리하지 않고 트림별로 처리.
          };
          
          // 트림 표준사양
          const SELTOS_GAS_TRENDY_F = ["스마트스트림 G1.6 T-GDI (193hp/27.0kgf·m)", "스마트스트림 8AT", "MDPS", "트랙션 모드(스노우/머드/샌드)", "FCA(교차/정면)+LKA2+LFA+HBA+DAW+ISLA+SCC+그립감지+진동경고", "9에어백+VSM+다중 충돌방지", "205/65 R16 전면가공", "LED 헤드램프+DRL+리어콤비+보조제동등", "리어스포일러", "EPB(오토홀드)", "후방 모니터", "버튼시동 스마트키+원격시동", "1열 열선", "1열 직물시트", "12.3\" 디스플레이 오디오+6스피커", "매뉴얼 에어컨"];
          const SELTOS_GAS_PRES_F = ["+NSCC+HDA", "215/55 R18 전면가공", "블랙하이그로시+루프랙", "파노라믹 와이드 디스플레이", "ECM 룸미러", "소프트 재질 크래시패드", "1열/2열 도어 암레스트 인조가죽", "프리미엄 바이오 인조가죽시트", "운전석 파워+허리지지대", "1열 통풍시트", "1열 시트백 포켓", "하이패스", "컬럼 타입 전자식 변속", "패들 쉬프트", "스마트폰 무선충전", "레인센서", "운전석 세이프티 파워윈도우", "터치 풀오토 에어컨", "공기청정", "오토디포그", "12.3\" 내비게이션", "AI 어시스턴트"];
          const SELTOS_GAS_SIG_F = ["+후측방 충돌방지(전진/주행)+RCCA+안전하차", "전자식 차일드락", "후진 가이드 램프", "오토 플러시 도어핸들", "그레이/브라운 인테리어 선택", "12.3\"클러스터", "프리미엄 스티어링", "스퀘어 패턴 엠보 시트", "동승석 파워+허리지지대", "1열 릴렉션 컴포트+워크인", "디지털 키 2", "스마트 파워테일게이트", "메모리+이지억세스", "100W USB"];
          const SELTOS_GAS_XL_F = ["+X-Line 전용 외장(범퍼/그릴/19\"블랙휠/스키드/다크메탈)", "프로젝션 LED 헤드램프+LED 턴시그널", "다이내믹 웰컴", "프리미엄 LED DRL+LED 포그", "그레이/브라운/블랙 인테리어 선택", "X-Line 전용 내장(스티어링/블랙 헤드라이닝/메탈 페달/메탈 도어스커프/메쉬 헤드레스트)", "X-Line 전용 패턴 엠보 시트"];
          
          const SELTOS_HEV_TRENDY_F = ["스마트스트림 G1.6 HEV + 32kW 모터", "6단 DCT", "MDPS", "후륜 멀티링크", "FCA(교차/정면)+LKA2+LFA+HBA+DAW+ISLA+SCC+그립감지+진동경고", "9에어백+VSM", "205/65 R16 전면가공", "LED 헤드램프+DRL+리어콤비", "리어스포일러", "EPB(오토홀드)", "컬럼 타입 전자식 변속", "패들 쉬프트", "후방 모니터", "1열 열선", "1열 직물시트", "파노라믹 와이드 디스플레이", "12.3\" 디스플레이 오디오+6스피커", "독립 풀오토 에어컨", "공기청정"];
          
          return {
            model_id: "seltos",
            model_name: "셀토스",
            category: "소형 SUV",
            year: 2026,
            variants: [
              // 1.6 가솔린 터보
              {
                variant_id: "gasoline_1_6t",
                variant_name: "가솔린 1.6 터보",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 1598,
                transmission: "스마트스트림 8AT",
                trims: [
                  { trim_id: "trendy", name: "트렌디", seats: 5, base_price_5: 2515, base_price_3_5: 2477, engine: "G1.6 T-GDI (193hp)",
                    fuel_economy: { combined: 12.5, urban: 11.1, highway: 14.6, co2: 132 },
                    standard_features: SELTOS_GAS_TRENDY_F,
                    available_options: ["electric_4wd", "style_pkg", "convenience", "navi_12_3", "builtin_cam_2_plus", "cluster_12_3"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 2884, base_price_3_5: 2840, engine: "G1.6 T-GDI",
                    fuel_economy: { combined: 12.0, urban: 10.7, highway: 14.0, co2: 138 },
                    standard_features: SELTOS_GAS_PRES_F,
                    available_options: ["electric_4wd", "style_pkg", "builtin_cam_2_plus", "cluster_12_3", "smart_connect", "drive_wise", "monitoring", "comfort", "harman_kardon", "hud"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 3149, base_price_3_5: 3101, engine: "G1.6 T-GDI",
                    fuel_economy: { combined: 11.6, urban: 10.3, highway: 13.6, co2: 143 },
                    standard_features: SELTOS_GAS_SIG_F,
                    available_options: ["electric_4wd", "style_pkg", "builtin_cam_2_plus", "drive_wise", "monitoring", "comfort", "harman_kardon", "hud", "panoramic_sunroof", "two_tone_roof"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 5, base_price_5: 3267, base_price_3_5: 3217, engine: "G1.6 T-GDI",
                    fuel_economy: { combined: 11.6, urban: 10.3, highway: 13.6, co2: 143 },
                    standard_features: SELTOS_GAS_XL_F,
                    available_options: ["electric_4wd", "builtin_cam_2_plus", "drive_wise", "monitoring", "comfort", "harman_kardon", "hud", "panoramic_sunroof", "two_tone_roof"] }
                ],
                options_master: SELTOS_GAS_OPTIONS,
                exclusive_groups: SELTOS_EXCLUSIVE_COMMON
              },
              // 1.6 하이브리드
              {
                variant_id: "hybrid_1_6",
                variant_name: "하이브리드 1.6",
                vehicle_type: "RV (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1580,
                transmission: "6단 DCT",
                trims: [
                  { trim_id: "trendy", name: "트렌디", seats: 5, base_price_5: 3044, base_price_3_5: 2996, engine: "G1.6 HEV + 32kW",
                    fuel_economy: { combined: 19.5, urban: 20.6, highway: 18.3, co2: 79 },
                    standard_features: SELTOS_HEV_TRENDY_F,
                    available_options: ["style_pkg", "convenience", "navi_12_3", "builtin_cam_2_plus", "cluster_12_3"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 3359, base_price_3_5: 3306, engine: "G1.6 HEV",
                    fuel_economy: { combined: 18.6, urban: 19.7, highway: 17.4, co2: 84 },
                    standard_features: ["+NSCC+HDA", "215/55 R18 전면가공", "블랙하이그로시+루프랙", "ECM 룸미러", "소프트 재질 크래시패드", "1열/2열 도어 암레스트 인조가죽", "프리미엄 바이오 인조가죽시트", "운전석 파워+허리지지대", "1열 통풍시트", "시트백 포켓", "하이패스", "스마트폰 무선충전", "레인센서", "운전석 세이프티 파워윈도우", "12.3\" 내비게이션", "AI 어시스턴트"],
                    available_options: ["style_pkg", "builtin_cam_2_plus", "cluster_12_3", "smart_connect", "drive_wise", "monitoring", "comfort", "harman_kardon", "v2l_indoor", "hud"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 3624, base_price_3_5: 3567, engine: "G1.6 HEV",
                    fuel_economy: { combined: 17.8, urban: 18.5, highway: 17.0, co2: 88 },
                    standard_features: ["+후측방 충돌방지+RCCA+안전하차", "전자식 차일드락", "후진 가이드", "오토 플러시 도어핸들", "그레이/브라운 인테리어 선택", "12.3\"클러스터", "프리미엄 스티어링", "스퀘어 패턴 엠보 시트", "동승석 파워+허리지지대", "1열 릴렉션 컴포트+워크인", "디지털 키 2", "스마트 파워테일게이트", "메모리+이지억세스", "100W USB"],
                    available_options: ["style_pkg", "builtin_cam_2_plus", "drive_wise", "monitoring", "comfort", "harman_kardon", "v2l_indoor", "hud", "panoramic_sunroof", "two_tone_roof"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 5, base_price_5: 3641, base_price_3_5: 3584, engine: "G1.6 HEV",
                    fuel_economy: { combined: 17.8, urban: 18.5, highway: 17.0, co2: 88 },
                    standard_features: ["+X-Line 전용 외장(범퍼/그릴/19\"블랙휠/스키드/다크메탈)", "프로젝션 LED 헤드램프+LED 턴시그널", "다이내믹 웰컴", "프리미엄 LED DRL+LED 포그", "그레이/브라운/블랙 인테리어 선택", "X-Line 전용 내장", "X-Line 전용 패턴 엠보 시트"],
                    available_options: ["builtin_cam_2_plus", "drive_wise", "monitoring", "comfort", "harman_kardon", "v2l_indoor", "hud", "panoramic_sunroof", "two_tone_roof"] }
                ],
                options_master: SELTOS_HEV_OPTIONS,
                exclusive_groups: SELTOS_EXCLUSIVE_COMMON
              }
            ],
            exterior_colors: [
              { name: "스노우 화이트 펄", code: "SWP", hex: "#f7f5f0", price: 8 },
              { name: "아이보리 실버", code: "ISG", hex: "#dcd6c5", price: 0 },
              { name: "아이스버그 그린", code: "IEG", hex: "#5a7a6b", price: 0 },
              { name: "프로스트 블루", code: "EBB", hex: "#a8b5c0", price: 0 },
              { name: "그래비티 그레이", code: "KDG", hex: "#6a6a6a", price: 0 },
              { name: "퓨전 블랙", code: "FSB", hex: "#2a2a2a", price: 0 },
              { name: "퓨전 블랙+스노우 화이트 펄 (투톤)", code: "CAS", hex: "#f7f5f0", price: 30 },
              { name: "퓨전 블랙+아이스버그 그린 (투톤)", code: "CBG", hex: "#5a7a6b", price: 30 },
              { name: "아이보리 매트 실버 (무광, X-Line 전용)", code: "ISM", hex: "#c8c2b3", price: 30 },
              { name: "마그마 매트 레드 (무광, X-Line 전용)", code: "MRM", hex: "#7a2a2a", price: 30 }
            ]
          };
        })(),
        
        // ========== 니로 ==========
        (() => {
          const NIRO_OPTIONS = {
            convenience: { name: "컨비니언스", sub: "인조가죽시트+1열 열선/통풍+시트백 포켓+열선 스티어링+운전석 자동쾌적 (트렌디 전용)", price: 65 },
            style_pkg: { name: "스타일 패키지", sub: "프로젝션 LED 헤드램프+LED 턴시그널/후진등/포그+블랙하이그로시 가니쉬+크롬 스키드 (프레스티지/시그니처)", price: 97 },
            wheel_18: { name: "18\" 휠", sub: "225/45 R18 콘티넨탈 타이어+전면가공 휠", price: 49 },
            premium: { name: "프리미엄", sub: "프리미엄 스티어링+스웨이드 내장재+앰비언트+메탈 페달+가죽시트+2열 열선+2열 센터 암레스트+220V 인버터 (프레스티지/시그니처, 블루 그레이 인테리어 선택 불가)", price: 124 },
            drive_wise_1: { name: "드라이브 와이즈 Ⅰ", sub: "후측방 충돌경고+RCCA+안전하차+차일드락 (드라이브 와이즈 Ⅱ와 중복 불가)", price: 42 },
            cluster_12_3_pack: { name: "12.3\" 클러스터 팩", sub: "12.3\"클러스터+파노라믹 커브드 디스플레이 (트렌디는 +12.3\"내비+NSCC+HDA+하이패스 포함 115만 / 프레스티지 40만, 시그니처 기본)", price: 115 },
            comfort: { name: "컴포트", sub: "메모리+이지억세스+동승석 파워+릴렉션+워크인+허리지지대 (프레스티지/시그니처, 12.3\"클러스터 팩 필요)", price: 99,
              requires_in_trim: { trendy: ["cluster_12_3_pack"], prestige: ["cluster_12_3_pack"] } },
            smart_connect: { name: "스마트 커넥트", sub: "디지털 키 2+크롬&터치 도어핸들+100W USB+스마트 파워테일게이트 (12.3\"클러스터 팩 필요)", price: 59,
              requires_in_trim: { trendy: ["cluster_12_3_pack"], prestige: ["cluster_12_3_pack"] } },
            harman_kardon: { name: "하만카돈 프리미엄 사운드", sub: "8스피커+외장앰프 (12.3\"클러스터 팩 필요)", price: 45,
              requires_in_trim: { trendy: ["cluster_12_3_pack"], prestige: ["cluster_12_3_pack"] } },
            sunroof_led: { name: "선루프 + LED 실내등", sub: "선루프+LED 맵/룸/러기지램프 (프레스티지 75만, 시그니처 55만, 12.3\"클러스터 팩 필요)", price: 75,
              requires_in_trim: { prestige: ["cluster_12_3_pack"] } },
            drive_wise_2: { name: "드라이브 와이즈 Ⅱ", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+HDA2(차로변경)+RCCA+안전하차+차일드락 (프레스티지 85만, 시그니처 55만, 드라이브 와이즈 Ⅰ과 중복 불가, 12.3\"클러스터 팩 필요)", price: 85,
              requires_in_trim: { prestige: ["cluster_12_3_pack"] } },
            hud: { name: "헤드업 디스플레이", sub: "(시그니처 전용)", price: 59 },
            builtin_cam_2_plus: { name: "빌트인 캠 2 플러스", sub: "빌트인 캠 2 플러스+증강현실 내비 (트렌디/프레스티지는 12.3\"클러스터 팩 필요)", price: 45,
              requires_in_trim: { trendy: ["cluster_12_3_pack"], prestige: ["cluster_12_3_pack"] } }
          };
          
          // 트림별 표준사양
          const NIRO_TRENDY_F = ["스마트스트림 G1.6 HEV + 32kW 모터", "6단 DCT", "MDPS", "후륜 멀티링크", "FCA(차량/보행자/자전거/교차/정면)+LKA2+LFA+HBA+DAW+ISLA+SCC+그립감지+진동경고", "10에어백+VSM+다중 충돌방지", "205/60 R16 전면가공", "LED 헤드램프+DRL+리어콤비+보조제동등", "리어스포일러", "EPB(오토홀드)", "패들 쉬프트(회생제동)", "버튼시동 스마트키+원격시동", "후방 모니터", "1열 직물시트", "운전석 시트 높이조절", "독립 풀오토 에어컨", "공기청정", "PTC 보조히터", "12.3\" 디스플레이 오디오", "6스피커", "1열 도어 암레스트 인조가죽"];
          const NIRO_PRESTIGE_F = ["+NSCC+HDA", "루프랙", "ECM 룸미러", "선바이저 조명", "차콜/블루 그레이/딥 네이비&브라운 인테리어 선택", "인조가죽시트", "운전석 파워+허리지지대", "1열 열선+통풍", "1열 시트백 포켓", "하이패스", "스마트폰 무선충전", "레인센서", "열선 스티어링", "운전석 자동쾌적", "2열 에어벤트", "12.3\" 내비게이션+AI 어시스턴트"];
          const NIRO_SIGNATURE_F = ["+측방 주차 경고+후방 주차 충돌방지", "에어로타입 와이퍼", "1열/2열 이중접합 차음 글라스", "12.3\"클러스터+파노라믹 커브드", "패드 프린트 가니쉬", "크롬 인사이드 도어핸들", "2열 도어 암레스트 인조가죽", "전자식 변속 다이얼", "동승석/2열 세이프티 파워윈도우", "서라운드 뷰+후측방 모니터", "리모트 360도", "원격 스마트 주차 보조"];
          
          return {
            model_id: "niro",
            model_name: "니로",
            category: "준중형 SUV (하이브리드)",
            year: 2026,
            variants: [
              {
                variant_id: "hybrid_1_6",
                variant_name: "하이브리드 1.6",
                vehicle_type: "RV (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1580,
                transmission: "6단 DCT",
                trims: [
                  { trim_id: "trendy", name: "트렌디", seats: 5, base_price_5: 2932, base_price_3_5: 2886, engine: "G1.6 HEV + 32kW",
                    fuel_economy: { combined: 20.2, urban: 21.4, highway: 18.8, co2: 76 },
                    standard_features: NIRO_TRENDY_F,
                    available_options: ["convenience", "wheel_18", "drive_wise_1", "cluster_12_3_pack", "harman_kardon"] },
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 3247, base_price_3_5: 3196, engine: "G1.6 HEV",
                    fuel_economy: { combined: 20.2, urban: 21.4, highway: 18.8, co2: 76 },
                    standard_features: NIRO_PRESTIGE_F,
                    available_options: ["style_pkg", "wheel_18", "premium", "drive_wise_1", "cluster_12_3_pack", "comfort", "smart_connect", "harman_kardon", "sunroof_led", "drive_wise_2", "builtin_cam_2_plus"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 3653, base_price_3_5: 3596, engine: "G1.6 HEV",
                    fuel_economy: { combined: 19.4, urban: 20.6, highway: 18.1, co2: 80 },
                    standard_features: NIRO_SIGNATURE_F,
                    available_options: ["style_pkg", "wheel_18", "premium", "drive_wise_1", "comfort", "smart_connect", "harman_kardon", "sunroof_led", "drive_wise_2", "hud", "builtin_cam_2_plus"] }
                ],
                options_master: NIRO_OPTIONS,
                // 드라이브 와이즈 Ⅰ ↔ Ⅱ 배타 (가격표 "중복 선택 불가" 명시)
                exclusive_groups: [
                  { id: "drive_wise", label: "드라이브 와이즈", members: ["drive_wise_1", "drive_wise_2"] }
                ]
              }
            ],
            exterior_colors: [
              { name: "스노우 화이트 펄", code: "SWP", hex: "#f7f5f0", price: 8 },
              { name: "아이보리 실버", code: "ISG", hex: "#dcd6c5", price: 0 },
              { name: "미네랄 블루 (트렌디 제외)", code: "M4B", hex: "#4a5b6e", price: 0 },
              { name: "스틸 그레이", code: "KLG", hex: "#7a7a78", price: 0 },
              { name: "인터스텔라 그레이 (트렌디 제외)", code: "AGT", hex: "#5d5e5f", price: 0 },
              { name: "시티스케이프 그린 (트렌디 제외)", code: "CGE", hex: "#5a6b54", price: 0 },
              { name: "오로라 블랙 펄", code: "ABP", hex: "#1a1a1a", price: 0 }
            ]
          };
        })(),
        
        // ========== 스포티지 ==========
        (() => {
          // 스포티지 공통 옵션 (가솔린/HEV) - LPG는 4WD 제외
          const SPORTAGE_GAS_HEV_OPTIONS = {
            electric_4wd: { name: "전자식 4WD", sub: "전자식 4WD + 터레인 모드(오토/스노우/머드/샌드)", price: 223 },
            style_pkg: { name: "스타일 패키지", sub: "18\"/19\" 휠+프로젝션 LED+LED 턴시그널+다이내믹 웰컴+LED 포그 (프레스티지 69만 - 18\"휠, 노블레스 89만 - 19\"휠 포함)", price: 89 },
            wheel_19: { name: "19\" 전면가공 휠", sub: "235/55 R19 (시그니처 전용, 스타일 패키지 안에 포함되는 트림은 별도 선택 불가)", price: 25 },
            comfort: { name: "컴포트", sub: "동승석 파워+워크인+허리지지대+2열 열선+리모트 폴딩 (노블레스 49만, 시그니처/X-Line 기본)", price: 49 },
            premium: { name: "프리미엄", sub: "메탈 페달+도어스커프+퀼팅 가죽/스웨이드 시트 (시그니처/X-Line, 라운지 브라운 인테리어 선택 불가)", price: 59 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+HDA2(차로변경)+안전하차+후석 알림(센서)+전방주시 카메라 (노블레스부터)", price: 124 },
            navi_12_3: { name: "12.3\" 내비게이션", sub: "12.3\"내비+하이패스+NSCC+HDA+1열 통풍시트 (프레스티지 옵션, 노블레스부터 기본)", price: 89 },
            builtin_cam_2: { name: "빌트인 캠 2", sub: "빌트인 캠 2+증강현실 내비 (12.3\"내비 필요)", price: 45,
              requires_in_trim: { prestige: ["navi_12_3"] } },
            monitoring: { name: "모니터링", sub: "서라운드 뷰+후측방 모니터+리모트 360도+후방 주차 충돌방지+원격 스마트 주차+측방 주차 거리경고 (노블레스부터, 12.3\"내비 필요)", price: 114 },
            krell_sound: { name: "KRELL 프리미엄 사운드", sub: "8스피커+외장앰프+액티브 엔진 사운드 (노블레스부터, 12.3\"내비 필요)", price: 59 },
            smart_connect: { name: "스마트 커넥트", sub: "HUD+디지털 키 2+지문인증+터치 도어핸들 (노블레스 119만, 시그니처/X-Line 기본, 12.3\"내비 필요)", price: 119 },
            panoramic_sunroof: { name: "파노라마 선루프", sub: "프레스티지 119만 (+루프랙), 노블레스/시그니처/X-Line 109만", price: 119 }
          };
          
          // 스포티지 LPG 옵션 (4WD 제외)
          const SPORTAGE_LPG_OPTIONS = {
            style_pkg: { name: "스타일 패키지", sub: "18\"/19\" 휠+프로젝션 LED+LED 턴시그널+다이내믹 웰컴+LED 포그 (프레스티지 69만, 노블레스 89만)", price: 89 },
            wheel_19: { name: "19\" 전면가공 휠", sub: "235/55 R19 (시그니처 전용)", price: 25 },
            comfort: { name: "컴포트", sub: "동승석 파워+워크인+허리지지대+2열 열선+리모트 폴딩 (노블레스부터)", price: 49 },
            premium: { name: "프리미엄", sub: "메탈 페달+도어스커프+퀼팅 가죽/스웨이드 시트 (시그니처/X-Line)", price: 59 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+HDA2+안전하차+후석 알림+전방주시 카메라 (노블레스부터)", price: 124 },
            navi_12_3: { name: "12.3\" 내비게이션", sub: "12.3\"내비+하이패스+NSCC+HDA+1열 통풍 (프레스티지 옵션, 노블레스부터 기본)", price: 89 },
            builtin_cam_2: { name: "빌트인 캠 2", sub: "빌트인 캠 2+증강현실 내비 (12.3\"내비 필요)", price: 45,
              requires_in_trim: { prestige: ["navi_12_3"] } },
            monitoring: { name: "모니터링", sub: "서라운드 뷰+후측방 모니터+리모트 360도+후방 주차 충돌방지+원격 스마트 주차+측방 주차 거리경고 (노블레스부터)", price: 114 },
            krell_sound: { name: "KRELL 프리미엄 사운드", sub: "8스피커+외장앰프", price: 59 },
            smart_connect: { name: "스마트 커넥트", sub: "HUD+디지털 키 2+지문인증+터치 도어핸들 (노블레스, 시그니처/X-Line 기본)", price: 119 },
            panoramic_sunroof: { name: "파노라마 선루프", sub: "프레스티지 119만, 노블레스 이상 109만", price: 119 }
          };
          
          // 트림 표준사양
          const SPORT_PRES_F = ["G1.6 T-GDI (180hp/27.0kgf·m)", "스마트스트림 8AT", "MDPS+고급형 ISG", "FCA(차량/보행자/자전거/교차/정면)+LKA2+LFA+HBA+DAW+ISLA+SCC+그립감지+진동경고", "8에어백+VSM+다중 충돌방지", "235/65 R17 전면가공", "LED 헤드램프+DRL+리어콤비+보조제동등", "에어로 와이퍼", "ECM 룸미러", "1열 열선", "인조가죽시트", "EPB(오토홀드)", "후방 모니터", "레인센서", "열선 스티어링", "운전석 세이프티 파워윈도우", "터치 풀오토 에어컨", "공기청정", "오토디포그", "2열 에어벤트", "12.3\" 디스플레이 오디오", "6스피커", "가죽 스티어링/변속노브"];
          const SPORT_NOB_F = ["+NSCC+HDA", "235/60 R18 전면가공", "2열 이중접합 차음", "블랙 하이그로시", "루프랙", "블랙/라운지 브라운 인테리어 선택", "12.3\"클러스터+파노라믹 커브드", "패드 프린트 가니쉬", "도어 암레스트 인조가죽", "크롬 인사이드 도어핸들", "운전석 파워+허리지지대", "1열 통풍", "하이패스", "전자식 변속 다이얼+패들 쉬프트", "스마트폰 무선충전", "스마트 파워테일게이트", "동승석/2열 세이프티 파워윈도우", "12.3\" 내비게이션"];
          const SPORT_SIG_F = ["+프로젝션 LED 헤드램프", "LED 턴시그널+다이내믹 웰컴+LED 포그", "터치 도어핸들", "블랙/라운지 브라운/네이비 그레이 인테리어 선택", "앰비언트", "우드 그레인 가니쉬", "크래시패드 리얼 스티치", "도어 센터트림 인조가죽", "프리미엄 인조가죽시트", "동승석 파워+워크인+허리지지대", "2열 열선+리모트 폴딩", "시트백 미니포켓", "옷걸이형 헤드레스트", "헤드업 디스플레이", "디지털 키 2", "지문인증", "운전석 메모리+이지 억세스"];
          const SPORT_XL_F = ["+X-Line 전용 외장(범퍼/그릴/19\"블랙휠/스키드/다크메탈)", "프로젝션 LED 헤드램프+LED 턴시그널+다이내믹 웰컴+LED 포그", "블랙 스웨이드 헤드라이닝", "프리미엄 스티어링", "블랙 엠블럼", "X-Line 전용 엠블럼"];
          
          const SPORT_HEV_PRES_F = ["1.6T HEV + 47.7kW 모터", "스마트스트림 6AT", "MDPS", "FCA+LKA2+LFA+HBA+DAW+ISLA+SCC+그립감지+진동경고", "8에어백+VSM", "235/65 R17 전면가공", "LED 헤드램프+DRL+리어콤비", "에어로 와이퍼", "ECM 룸미러", "1열 열선", "인조가죽시트", "전자식 변속 다이얼+패들 쉬프트", "EPB(오토홀드)", "후방 모니터", "PTC 보조히터", "12.3\" 디스플레이 오디오"];
          
          return {
            model_id: "sportage",
            model_name: "스포티지",
            category: "준중형 SUV",
            year: 2026,
            variants: [
              // 1.6 가솔린 터보 (4트림)
              {
                variant_id: "gasoline_1_6t",
                variant_name: "가솔린 1.6 터보",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 1598,
                transmission: "스마트스트림 8AT",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 2907, base_price_3_5: 2863, engine: "G1.6 T-GDI (180hp)",
                    fuel_economy: { combined: 12.3, urban: 11.2, highway: 14.0, co2: 134 },
                    standard_features: SPORT_PRES_F,
                    available_options: ["electric_4wd", "style_pkg", "navi_12_3", "builtin_cam_2", "panoramic_sunroof"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 3246, base_price_3_5: 3197, engine: "G1.6 T-GDI",
                    fuel_economy: { combined: 12.0, urban: 10.8, highway: 13.7, co2: 138 },
                    standard_features: SPORT_NOB_F,
                    available_options: ["electric_4wd", "style_pkg", "comfort", "drive_wise", "builtin_cam_2", "monitoring", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 3511, base_price_3_5: 3458, engine: "G1.6 T-GDI",
                    fuel_economy: { combined: 11.5, urban: 10.4, highway: 13.1, co2: 144 },
                    standard_features: SPORT_SIG_F,
                    available_options: ["electric_4wd", "wheel_19", "premium", "drive_wise", "builtin_cam_2", "monitoring", "krell_sound"] },
                  { trim_id: "x_line", name: "X-Line", seats: 5, base_price_5: 3576, base_price_3_5: 3522, engine: "G1.6 T-GDI",
                    fuel_economy: { combined: 11.5, urban: 10.4, highway: 13.1, co2: 144 },
                    standard_features: SPORT_XL_F,
                    available_options: ["electric_4wd", "premium", "drive_wise", "builtin_cam_2", "monitoring", "krell_sound"] }
                ],
                options_master: SPORTAGE_GAS_HEV_OPTIONS
              },
              // 2.0 LPG (4트림, 4WD 없음)
              {
                variant_id: "lpg_2_0",
                variant_name: "LPG 2.0",
                vehicle_type: "RV (LPG)",
                fuel: "LPG",
                displacement_cc: 1999,
                transmission: "6단 자동",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 2972, base_price_3_5: 2927, engine: "L2.0 (146hp)",
                    fuel_economy: { combined: 9.2, urban: 8.2, highway: 10.6, co2: 143 },
                    standard_features: ["L2.0 + 원형 봄베", ...SPORT_PRES_F.slice(1)],
                    available_options: ["style_pkg", "navi_12_3", "builtin_cam_2", "panoramic_sunroof"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 3311, base_price_3_5: 3261, engine: "L2.0",
                    fuel_economy: { combined: 8.7, urban: 7.7, highway: 10.3, co2: 151 },
                    standard_features: SPORT_NOB_F,
                    available_options: ["style_pkg", "comfort", "drive_wise", "builtin_cam_2", "monitoring", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 3576, base_price_3_5: 3522, engine: "L2.0",
                    fuel_economy: { combined: 8.6, urban: 7.6, highway: 10.1, co2: 153 },
                    standard_features: SPORT_SIG_F,
                    available_options: ["wheel_19", "premium", "drive_wise", "builtin_cam_2", "monitoring", "krell_sound"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 5, base_price_5: 3641, base_price_3_5: 3586, engine: "L2.0",
                    fuel_economy: { combined: 8.6, urban: 7.6, highway: 10.1, co2: 153 },
                    standard_features: SPORT_XL_F,
                    available_options: ["premium", "drive_wise", "builtin_cam_2", "monitoring", "krell_sound"] }
                ],
                options_master: SPORTAGE_LPG_OPTIONS
              },
              // 1.6 터보 하이브리드 (4트림)
              {
                variant_id: "hybrid_1_6t",
                variant_name: "터보 하이브리드 1.6",
                vehicle_type: "RV (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1598,
                transmission: "스마트스트림 6AT",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 3499, base_price_3_5: 3444, engine: "1.6T HEV + 47.7kW",
                    fuel_economy: { combined: 16.3, urban: 16.9, highway: 15.5, co2: 98 },
                    standard_features: SPORT_HEV_PRES_F,
                    available_options: ["electric_4wd", "style_pkg", "navi_12_3", "builtin_cam_2", "panoramic_sunroof"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 3828, base_price_3_5: 3768, engine: "1.6T HEV",
                    fuel_economy: { combined: 16.3, urban: 16.9, highway: 15.5, co2: 98 },
                    standard_features: ["+NSCC+HDA", "235/60 R18 컨티넨탈", "2열 이중접합 차음", "블랙 하이그로시+루프랙", "12.3\"클러스터+파노라믹 커브드", "도어 암레스트 인조가죽", "크롬 인사이드 도어핸들", "운전석 파워+허리지지대", "1열 통풍", "하이패스", "스마트폰 무선충전", "스마트 파워테일게이트", "동승석/2열 세이프티 파워윈도우", "12.3\" 내비게이션"],
                    available_options: ["electric_4wd", "style_pkg", "comfort", "drive_wise", "builtin_cam_2", "monitoring", "krell_sound", "smart_connect", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 4093, base_price_3_5: 4029, engine: "1.6T HEV",
                    fuel_economy: { combined: 15.6, urban: 16.2, highway: 14.8, co2: 102 },
                    standard_features: SPORT_SIG_F,
                    available_options: ["electric_4wd", "wheel_19", "premium", "drive_wise", "builtin_cam_2", "monitoring", "krell_sound"] },
                  { trim_id: "x_line", name: "X-Line", seats: 5, base_price_5: 4058, base_price_3_5: 3995, engine: "1.6T HEV",
                    fuel_economy: { combined: 15.6, urban: 16.2, highway: 14.8, co2: 102 },
                    standard_features: SPORT_XL_F,
                    available_options: ["electric_4wd", "premium", "drive_wise", "builtin_cam_2", "monitoring", "krell_sound"] }
                ],
                options_master: SPORTAGE_GAS_HEV_OPTIONS
              }
            ],
            exterior_colors: [
              { name: "스노우 화이트 펄", code: "SWP", hex: "#f7f5f0", price: 8 },
              { name: "헤리티지 블루", code: "HRB", hex: "#3a4a65", price: 0 },
              { name: "울프 그레이", code: "C7A", hex: "#7a7a78", price: 0 },
              { name: "그래비티 그레이", code: "KDG", hex: "#6a6a6a", price: 0 },
              { name: "베스타 블루", code: "BB2", hex: "#5a7a90", price: 0 },
              { name: "퓨전 블랙", code: "FSB", hex: "#2a2a2a", price: 0 },
              { name: "정글 우드 그린 (X-Line 전용)", code: "JUG", hex: "#4a5a40", price: 0 },
              { name: "쉐도우 매트 그레이 (무광, X-Line 전용)", code: "MGG", hex: "#4a4d50", price: 30 }
            ]
          };
        })(),
        
        // ========== 쏘렌토 ==========
        (() => {
          // 가솔린/디젤 공통 옵션 (전자식 4WD 옵션 운영)
          const SORENTO_GAS_DIESEL_OPTIONS = {
            electric_4wd: { name: "전자식 4WD", sub: "터레인 모드(오토/스노우/머드/샌드) (가솔린/디젤 전 트림 232만)", price: 232 },
            seat_6: { name: "6인승", sub: "2열 독립 캡틴시트(슬라이딩/리클라이닝/윙아웃 헤드레스트)+3열 5:5 폴딩+2열 원터치 워크인+후석 매뉴얼 에어컨 (5인승 기본 → 84만 추가)", price: 84 },
            seat_7: { name: "7인승", sub: "3열 5:5 폴딩+2열 원터치 워크인+후석 매뉴얼 에어컨 (5인승 기본 → 69만 추가)", price: 69 },
            style_pkg: { name: "스타일 패키지", sub: "255/45 R20 컨티넨탈+프로젝션 LED(시퀀셜)+LED 턴시그널+LED 리어콤비 (프 124만 +루프랙, 노 114만)", price: 124,
              trim_prices: { noblesse: 114 } },
            comfort: { name: "컴포트 패키지", sub: "퀼팅 나파가죽+에르고 모션+릴렉션 컴포트+1열 파워 레그서포트+허리지지대+동승석 통풍+스웨이드 (시그 109만 +퀼팅 나파, X-Line 60만 -나파 제외)", price: 109,
              trim_prices: { x_line: 60 } },
            cluster_12_3: { name: "12.3\" 클러스터", sub: "슈퍼비전 클러스터+파노라믹 커브드 디스플레이 (프레스티지 옵션 59만, 노블레스부터 기본)", price: 59 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+NSCC(진출입)+HDA2(차로변경)+RCCA+안전하차+전자식 차일드락+후석 알림(센서) (전 트림 129만, 12.3\"클러스터 필요)", price: 129,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            hud_builtin_cam: { name: "HUD + 빌트인 캠 2", sub: "헤드업 디스플레이+빌트인 캠 2+증강현실 내비 (전 트림 119만, 12.3\"클러스터 필요)", price: 119,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            smart_connect: { name: "스마트 커넥트", sub: "지문 인증+디지털 센터 미러 (노 80만 +220V 인버터, 시·X 70만)", price: 80,
              trim_prices: { signature: 70, x_line: 70 } },
            krell_sound: { name: "KRELL 프리미엄 사운드", sub: "12스피커+외장앰프+액티브 엔진 사운드(가솔린 2.5T 전용) (노블레스/시그니처/X-Line 64만)", price: 64 },
            panoramic_sunroof: { name: "파노라마 선루프", sub: "(프레스티지는 스타일 패키지 선택 시 가능, 노블레스부터 단독 선택 가능)", price: 109 }
          };
          
          // HEV 공통 옵션 (4WD는 variant 분리, 19" 휠 추가)
          const SORENTO_HEV_OPTIONS = {
            seat_6: { name: "6인승", sub: "2열 독립 캡틴시트+3열 5:5 폴딩 (5인승 기본 → 84만 추가)", price: 84 },
            seat_7: { name: "7인승", sub: "3열 5:5 폴딩 (5인승 기본 → 69만 추가)", price: 69 },
            style_pkg: { name: "스타일 패키지", sub: "235/60 R18 컨티넨탈+블랙 알로이 휠+프로젝션 LED(시퀀셜)+LED 턴시그널+LED 리어콤비 (프 114만 +루프랙, 노 104만)", price: 114,
              trim_prices: { noblesse: 104 } },
            comfort: { name: "컴포트 패키지", sub: "퀼팅 나파가죽+에르고 모션+릴렉션 컴포트+허리지지대+동승석 통풍+스웨이드 (시그 109만, X-Line 60만)", price: 109,
              trim_prices: { x_line: 60 } },
            cluster_12_3: { name: "12.3\" 클러스터", sub: "슈퍼비전 클러스터+파노라믹 커브드 디스플레이 (프레스티지 옵션 59만, 노블레스부터 기본)", price: 59 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+NSCC(진출입)+HDA2(차로변경)+RCCA+안전하차+전자식 차일드락 (전 트림 129만, 12.3\"클러스터 필요)", price: 129,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            hud_builtin_cam: { name: "HUD + 빌트인 캠 2", sub: "헤드업 디스플레이+빌트인 캠 2+증강현실 내비 (전 트림 119만, 12.3\"클러스터 필요)", price: 119,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            smart_connect: { name: "스마트 커넥트", sub: "지문 인증+디지털 센터 미러 (노 80만 +220V 인버터, 시·X 70만)", price: 80,
              trim_prices: { signature: 70, x_line: 70 } },
            krell_sound: { name: "KRELL 프리미엄 사운드", sub: "12스피커+외장앰프 (노블레스/시그니처/X-Line 64만)", price: 64 },
            panoramic_sunroof: { name: "파노라마 선루프", sub: "(프레스티지는 스타일 패키지 선택 시 가능, 노블레스부터 단독)", price: 109 },
            wheel_19: { name: "19\" 휠", sub: "235/55 R19 국산 타이어+전면가공 (X-Line은 블랙 알로이) - 하이브리드 시그니처/X-Line 限, 2WD는 19\" 선택 시에도 세제혜택 유지", price: 30 }
          };
          
          // 트림 표준사양
          const SOR_GD_PRES_F = ["스마트스트림 G2.5 T-GDI (281hp/43.0kgf·m) 또는 D2.2 디젤(202hp/45.0kgf·m)", "스마트스트림 습식 8DCT", "R-MDPS+고급형 ISG", "FCA(차량/보행자/자전거/교차/정면)+LKA2+LFA+HBA+DAW+SCC+NSCC+HDA+차로유지 보조2+그립감지+진동경고", "10에어백+VSM+다중 충돌방지", "235/60 R18 컨티넨탈", "LED 헤드램프+DRL+포그+리어콤비+보조제동등", "에어로 와이퍼+1열 이중접합 차음", "ECM 룸미러", "우드 그레인 내장재", "버튼시동 스마트키+원격시동", "8단 변속기+패들 쉬프트", "EPB(오토홀드)", "후방 모니터", "레인센서", "1열 열선+통풍+파워시트+허리지지대", "동승석 워크인", "2열 슬라이딩 6:4 폴딩+리클라이닝+열선", "2열 원터치 폴딩", "인조가죽시트", "터치 풀오토 에어컨", "공기청정", "오토디포그", "12.3\" 내비게이션+6스피커", "하이패스", "스마트폰 무선충전", "스마트 파워테일게이트", "후석 승객 알림", "운전석 자동쾌적 제어", "2열 파워아웃렛", "1열 도어 맵포켓 앰비언트"];
          const SOR_GD_NOB_F = ["+후방 주차 충돌방지", "측방 주차 거리경고", "터치타입 도어핸들", "새틴 크롬 스키드 플레이트", "루프랙", "12.3\"클러스터+파노라믹 커브드", "프리미엄 스티어링", "인서트 필름 내장재", "도어 센터트림 나파엠보", "가죽시트", "2열 측면 수동 선커튼", "2열 세이프티 파워윈도우", "서라운드 뷰+후측방 모니터", "리모트 360도 뷰", "기아 디지털 키 2", "운전자세 메모리", "운전석 이지억세스", "원격 스마트 주차 보조"];
          const SOR_GD_SIG_F = ["+후진 가이드 램프", "255/45 R20 컨티넨탈+전면가공", "프로젝션 LED(시퀀셜)+LED 턴시그널", "LED 리어 콤비", "2열 이중접합 차음", "니트 내장재 A/B 필라", "앰비언트 라이트", "메탈 페달+도어스커프", "전동 틸트&텔레스코픽", "220V 인버터"];
          const SOR_GD_XL_F = ["+X-Line 전용 외장(255/45 R20 블랙 알로이+블랙 그릴+다크메탈 가니쉬+블랙 미러/루프랙/엠블럼)", "X-Line 전용 가죽시트(나파 미적용)", "스웨이드 내장재"];
          
          const SOR_HEV_PRES_F = ["스마트스트림 1.6T HEV + 47.7kW 모터", "스마트스트림 6AT", "R-MDPS", "FCA(차량/보행자/자전거/교차/정면)+LKA2+LFA+HBA+DAW+SCC+NSCC+HDA+차로유지 보조2+그립감지+진동경고", "10에어백+VSM", "235/65 R17 전면가공", "LED 헤드램프+DRL+포그+리어콤비", "에어로 와이퍼", "ECM 룸미러", "우드 그레인 내장재", "버튼시동 스마트키", "전자식 변속 다이얼+패들 쉬프트", "EPB(오토홀드)", "후방 모니터", "1열 열선+통풍+파워+허리지지대", "동승석 워크인", "2열 슬라이딩 6:4 폴딩+열선", "인조가죽시트", "터치 풀오토 에어컨", "공기청정", "오토디포그", "PTC 보조 히터", "12.3\" 내비게이션+6스피커", "하이패스", "스마트폰 무선충전", "스마트 파워테일게이트", "후석 승객 알림", "1열 도어 맵포켓 앰비언트"];
          
          return {
            model_id: "sorento",
            model_name: "쏘렌토",
            category: "중형 SUV",
            year: 2026,
            variants: [
              // 2.5 가솔린 터보 (5인승 기본)
              {
                variant_id: "gasoline_2_5t",
                variant_name: "가솔린 2.5 터보",
                vehicle_type: "RV",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "스마트스트림 습식 8DCT",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 3635, base_price_3_5: 3581, engine: "G2.5 T-GDI (281hp)",
                    fuel_economy: { combined: 10.8, urban: 9.4, highway: 13.0, co2: 156 },
                    standard_features: SOR_GD_PRES_F,
                    available_options: ["electric_4wd", "seat_6", "seat_7", "style_pkg", "cluster_12_3", "drive_wise", "hud_builtin_cam", "panoramic_sunroof"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 3951, base_price_3_5: 3892, engine: "G2.5 T-GDI",
                    fuel_economy: { combined: 10.8, urban: 9.4, highway: 13.0, co2: 156 },
                    standard_features: SOR_GD_NOB_F,
                    available_options: ["electric_4wd", "seat_6", "seat_7", "style_pkg", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 4232, base_price_3_5: 4169, engine: "G2.5 T-GDI",
                    fuel_economy: { combined: 10.1, urban: 9.0, highway: 11.8, co2: 166 },
                    standard_features: SOR_GD_SIG_F,
                    available_options: ["electric_4wd", "seat_6", "seat_7", "comfort", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 5, base_price_5: 4325, base_price_3_5: 4260, engine: "G2.5 T-GDI",
                    fuel_economy: { combined: 10.1, urban: 9.0, highway: 11.8, co2: 166 },
                    standard_features: SOR_GD_XL_F,
                    available_options: ["electric_4wd", "seat_6", "seat_7", "comfort", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof"] }
                ],
                options_master: SORENTO_GAS_DIESEL_OPTIONS,
                exclusive_groups: [
                  { id: "seats", label: "좌석 구성 (5인승 기본)", members: ["seat_6", "seat_7"] }
                ]
              },
              // 2.2 디젤 (5인승 기본, 가솔린 + 173만)
              {
                variant_id: "diesel_2_2",
                variant_name: "디젤 2.2",
                vehicle_type: "RV",
                fuel: "디젤",
                displacement_cc: 2151,
                transmission: "스마트스트림 습식 8DCT",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 3808, base_price_3_5: 3751, engine: "스마트스트림 D2.2 (202hp/45.0kgf·m) - 가솔린 + 173만",
                    fuel_economy: { combined: 14.3, urban: 12.7, highway: 17.0, co2: 132 },
                    standard_features: ["+스마트스트림 D2.2 (202hp/45.0kgf·m)", "PTC 보조 히터", ...SOR_GD_PRES_F.slice(1)],
                    available_options: ["electric_4wd", "seat_6", "seat_7", "style_pkg", "cluster_12_3", "drive_wise", "hud_builtin_cam", "panoramic_sunroof"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 4124, base_price_3_5: 4062, engine: "D2.2",
                    fuel_economy: { combined: 14.3, urban: 12.7, highway: 17.0, co2: 132 },
                    standard_features: SOR_GD_NOB_F,
                    available_options: ["electric_4wd", "seat_6", "seat_7", "style_pkg", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 4405, base_price_3_5: 4339, engine: "D2.2",
                    fuel_economy: { combined: 13.2, urban: 11.7, highway: 15.8, co2: 144 },
                    standard_features: SOR_GD_SIG_F,
                    available_options: ["electric_4wd", "seat_6", "seat_7", "comfort", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 5, base_price_5: 4500, base_price_3_5: 4433, engine: "D2.2",
                    fuel_economy: { combined: 13.2, urban: 11.7, highway: 15.8, co2: 144 },
                    standard_features: SOR_GD_XL_F,
                    available_options: ["electric_4wd", "seat_6", "seat_7", "comfort", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof"] }
                ],
                options_master: SORENTO_GAS_DIESEL_OPTIONS,
                exclusive_groups: [
                  { id: "seats", label: "좌석 구성 (5인승 기본)", members: ["seat_6", "seat_7"] }
                ]
              },
              // 1.6 터보 하이브리드 (2WD, 5인승 기본)
              {
                variant_id: "hybrid_1_6t_2wd",
                variant_name: "터보 하이브리드 1.6 (2WD)",
                vehicle_type: "RV (하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1598,
                transmission: "스마트스트림 6AT",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 4058, base_price_3_5: 3994, engine: "1.6T HEV + 47.7kW (세제혜택 후)",
                    fuel_economy: { combined: 15.7, urban: 16.6, highway: 14.6, co2: 102 },
                    standard_features: SOR_HEV_PRES_F,
                    available_options: ["seat_6", "seat_7", "style_pkg", "cluster_12_3", "drive_wise", "hud_builtin_cam", "panoramic_sunroof"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 4384, base_price_3_5: 4315, engine: "1.6T HEV",
                    fuel_economy: { combined: 15.7, urban: 16.6, highway: 14.6, co2: 102 },
                    standard_features: SOR_GD_NOB_F,
                    available_options: ["seat_6", "seat_7", "style_pkg", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 4637, base_price_3_5: 4564, engine: "1.6T HEV",
                    fuel_economy: { combined: 15.7, urban: 16.6, highway: 14.6, co2: 102 },
                    standard_features: SOR_GD_SIG_F,
                    available_options: ["seat_6", "seat_7", "comfort", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof", "wheel_19"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 5, base_price_5: 4632, base_price_3_5: 4559, engine: "1.6T HEV",
                    fuel_economy: { combined: 14.8, urban: 15.2, highway: 14.3, co2: 109 },
                    standard_features: SOR_GD_XL_F,
                    available_options: ["seat_6", "seat_7", "comfort", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof", "wheel_19"] }
                ],
                options_master: SORENTO_HEV_OPTIONS,
                exclusive_groups: [
                  { id: "seats", label: "좌석 구성 (5인승 기본)", members: ["seat_6", "seat_7"] }
                ]
              },
              // 1.6 터보 하이브리드 (전자식 4WD, 5인승 기본)
              {
                variant_id: "hybrid_1_6t_4wd",
                variant_name: "터보 하이브리드 1.6 (전자식 4WD)",
                vehicle_type: "RV (하이브리드/4WD)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1598,
                transmission: "스마트스트림 6AT",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 5, base_price_5: 4290, base_price_3_5: 4222, engine: "1.6T HEV + 4WD + 터레인 모드 (세제혜택 미적용)",
                    fuel_economy: { combined: 13.8, urban: 14.0, highway: 13.4, co2: 118 },
                    standard_features: ["+전자식 4WD + 터레인 모드(오토/스노우/머드/샌드)", ...SOR_HEV_PRES_F],
                    available_options: ["seat_6", "seat_7", "style_pkg", "cluster_12_3", "drive_wise", "hud_builtin_cam", "panoramic_sunroof"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 5, base_price_5: 4616, base_price_3_5: 4543, engine: "1.6T HEV + 4WD",
                    fuel_economy: { combined: 13.8, urban: 14.0, highway: 13.4, co2: 118 },
                    standard_features: ["+전자식 4WD + 터레인 모드", ...SOR_GD_NOB_F],
                    available_options: ["seat_6", "seat_7", "style_pkg", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof"] },
                  { trim_id: "signature", name: "시그니처", seats: 5, base_price_5: 4869, base_price_3_5: 4792, engine: "1.6T HEV + 4WD",
                    fuel_economy: { combined: 13.8, urban: 14.0, highway: 13.4, co2: 118 },
                    standard_features: ["+전자식 4WD + 터레인 모드", ...SOR_GD_SIG_F],
                    available_options: ["seat_6", "seat_7", "comfort", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof", "wheel_19"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 5, base_price_5: 4966, base_price_3_5: 4888, engine: "1.6T HEV + 4WD",
                    fuel_economy: { combined: 13.8, urban: 14.0, highway: 13.4, co2: 118 },
                    standard_features: ["+전자식 4WD + 터레인 모드", ...SOR_GD_XL_F],
                    available_options: ["seat_6", "seat_7", "comfort", "drive_wise", "hud_builtin_cam", "smart_connect", "krell_sound", "panoramic_sunroof", "wheel_19"] }
                ],
                options_master: SORENTO_HEV_OPTIONS,
                exclusive_groups: [
                  { id: "seats", label: "좌석 구성 (5인승 기본)", members: ["seat_6", "seat_7"] }
                ]
              }
            ],
            exterior_colors: [
              { name: "스노우 화이트 펄", code: "SWP", hex: "#f7f5f0", price: 8 },
              { name: "볼캐닉 샌드 브라운", code: "BN4", hex: "#7a6a55", price: 0 },
              { name: "시티스케이프 그린", code: "CGE", hex: "#5a6b54", price: 0 },
              { name: "인터스텔라 그레이", code: "AGT", hex: "#5d5e5f", price: 0 },
              { name: "오로라 블랙 펄", code: "ABP", hex: "#1a1a1a", price: 0 }
            ]
          };
        })(),
        
        // ========== 카니발 ==========
        (() => {
          // 카니발 9인승 옵션 마스터
          const CARNIVAL_9_OPTIONS = {
            convenience: { name: "컨비니언스", sub: "하이패스+스마트폰 무선충전+스마트 파워 슬라이딩 도어 (프레스티지 110만, 노블레스부터 기본)", price: 110 },
            style_pkg: { name: "스타일 패키지", sub: "프로젝션 LED+LED 포그+LED 턴시그널+235/55 R19 외산 (프/노 100만, 시 70만)", price: 100,
              trim_prices: { signature: 70 } },
            comfort: { name: "컴포트 패키지", sub: "2열 통풍+2열 파워 리클라이닝(풀플랫)+확장 센터콘솔+3열 USB+UV-C 살균+광촉매 살균 (노 가죽시트, 시·X 나파가죽시트 - 전 트림 140만)", price: 140 },
            smart_connect: { name: "스마트 커넥트", sub: "지문 인증+디지털 센터 미러 (노/시/X 75만)", price: 75 },
            cluster_12_3: { name: "12.3\" 클러스터", sub: "슈퍼비전 클러스터+파노라믹 커브드 디스플레이 (프 60만, 노블레스부터 기본)", price: 60 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+NSCC(진출입)+HDA2(차로변경)+후석 알림(센서) (전 트림 120만, 12.3\"클러스터 필요)", price: 120,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            monitoring: { name: "모니터링 팩", sub: "서라운드 뷰+후측방 모니터+리모트 360도+후방 주차 충돌방지+측방 주차 경고 (프 90만, 노/시/X 75만 +원격 스마트 주차)", price: 90,
              trim_prices: { noblesse: 75, signature: 75, x_line: 75 } },
            hud_builtin_cam: { name: "HUD + 빌트인 캠 2", sub: "헤드업 디스플레이+빌트인 캠 2+증강현실 내비 (전 트림 120만, 12.3\"클러스터 필요)", price: 120,
              requires_in_trim: { prestige: ["cluster_12_3"] } },
            bose_sound: { name: "BOSE 프리미엄 사운드", sub: "12스피커+외장앰프 (노블레스/시그/X-Line 120만)", price: 120 },
            sunroof_dual: { name: "듀얼 선루프", sub: "(노블레스부터 80만)", price: 80 },
            rear_ent: { name: "후석 스마트 엔터테인먼트 시스템", sub: "독립 좌/우 모니터+유선 미러링+OTT 스트리밍 (가솔린/HEV 전용, 프레스티지/네이비 그레이 인테리어 미적용, 마이컴포트와 중복 불가)", price: 268 },
            my_comfort: { name: "마이컴포트 패키지", sub: "(프레스티지 미적용, 네이비 그레이 인테리어 미적용, 후석 엔터테인먼트와 중복 불가)", price: 126 }
          };
          
          // 카니발 7인승 옵션 마스터 (가격 다름)
          const CARNIVAL_7_OPTIONS = {
            style_pkg: { name: "스타일 패키지", sub: "프로젝션 LED+LED 포그+LED 턴시그널 (노 79만, 시 47만 - 7인승은 19\"휠 기본)", price: 79,
              trim_prices: { signature: 47 } },
            comfort: { name: "컴포트 패키지", sub: "2열 다이내믹 바디케어시트+UV-C 살균+광촉매 살균+항균 필터 (119만, 아웃도어 미적용)", price: 119 },
            smart_connect: { name: "스마트 커넥트", sub: "지문 인증+디지털 센터 미러 (전 트림 79만)", price: 79 },
            drive_wise: { name: "드라이브 와이즈", sub: "FCA(교차/측방/추월/회피)+SCC(연동)+HDA2+후측방 충돌방지+후석 알림(센서) (전 트림 79만)", price: 79 },
            monitoring: { name: "모니터링 팩", sub: "서라운드 뷰+후측방 모니터+리모트 360도+후방 주차 충돌방지+측방 주차 경고+원격 스마트 주차 (전 트림 127만)", price: 127 },
            hud_builtin_cam: { name: "HUD + 빌트인 캠 2", sub: "헤드업 디스플레이+빌트인 캠 2+증강현실 내비 (전 트림 127만)", price: 127 },
            bose_sound: { name: "BOSE 프리미엄 사운드", sub: "12스피커+외장앰프 (시그니처/X-Line 95만, 도어타입 러기지 트레이 미적용)", price: 95 },
            sunroof_dual: { name: "듀얼 선루프", sub: "(전 트림 84만)", price: 84 },
            rear_ent: { name: "후석 스마트 엔터테인먼트 시스템", sub: "(가솔린/HEV 전용, 아웃도어/네이비 그레이 미적용, 마이컴포트와 중복 불가)", price: 277 },
            my_comfort: { name: "마이컴포트 패키지", sub: "(아웃도어/네이비 그레이 미적용, 후석 엔터테인먼트와 중복 불가)", price: 133 }
          };
          
          // 트림 표준사양 (9인승 기준)
          const CARN_9_PRES_F = ["스마트스트림 G3.5 GDI (294hp/36.2kgf·m)", "8단 자동변속기", "MDPS", "FCA(차량/보행자/자전거/교차/정면)+LKA2+LFA+HBA+DAW+ISLA+SCC+NSCC+HDA+차로유지 보조2+그립감지+진동경고", "8에어백+VSM+다중 충돌방지+횡풍안정제어", "235/60 R18 외산", "LED 헤드램프+DRL+리피터", "크롬 도어핸들", "에어로 와이퍼", "윈드쉴드 이중접합 차음", "루프랙", "토프 인테리어", "ECM 룸미러", "버튼시동 스마트키+원격시동", "8단 변속+패들 쉬프트", "EPB(오토홀드)", "스마트 파워테일게이트", "1열/2열 열선", "1열 통풍", "운전석 허리지지대", "2열 독립시트(슬라이딩/리클라이닝/워크인)", "3열 독립시트(쿠션팁업/슬라이딩/리클라이닝)", "4열 팝업 싱킹", "인조가죽시트", "독립 풀오토 에어컨(1/2/3열)", "공기청정", "오토디포그", "후석 보조 에어컨 필터", "12.3\" 내비게이션+8스피커", "후석 대화모드", "외부공기 유입방지", "후석 승객 알림"];
          const CARN_9_NOB_F = ["+후측방 충돌경고+RCCA+안전하차", "터치 도어핸들(1열)", "1열/2열 이중접합 차음", "크롬 몰딩+크롬 가니쉬", "블랙 하이그로시 도어 프레임", "토프/코튼 베이지 인테리어 선택", "12.3\"클러스터+파노라믹 커브드", "1열 크롬 인사이드 도어핸들", "1열 파워시트", "동승석 워크인", "운전석 4WAY 전동 허리지지대", "하이패스", "스마트 파워 슬라이딩 도어", "2/3열 측면 수동 선커튼", "동승석/2열 세이프티 파워윈도우", "스마트폰 무선충전", "디지털 키 2", "멀티존 음성인식"];
          const CARN_9_SIG_F = ["+LED 리어 콤비+리어 LED 턴시그널", "(HEV 시 네이비 그레이 인테리어 추가 선택)", "블랙 하이그로시 내장재", "앰비언트", "1열 도어 센터트림 스티치", "가죽시트", "운전석 에르고 모션", "2열 시트벨트 버클 조명", "운전자세 메모리", "운전석 이지억세스", "후진연동 사이드미러", "220V 인버터"];
          const CARN_9_XL_F = ["+X-Line 전용 외장(235/55 R19 블랙휠+블랙 라디에이터 그릴+블랙 엠블럼+다크 외장 포인트)", "프로젝션 LED 헤드램프+LED 포그+프론트 LED 턴시그널"];
          
          const CARN_7_NOB_F = [...CARN_9_NOB_F.slice(0, -1),
            "+235/55 R19 외산 휠 (7인승 기본)", "전좌석 세이프티 파워윈도우", "2열 프리미엄 릴렉션 시트(원터치/파워 리클라이닝/레그서포트/슬라이딩)", "3열 6:4 싱킹 시트(리클라이닝)", "1열/2열 통풍시트", "도어타입 러기지 트레이", "확장형 센터콘솔", "3열 USB-C 충전"];
          const CARN_7_OUTDOOR_F = ["▶ 노블레스 대비:", "2열 독립시트(슬라이딩/리클라이닝/워크인, 프리미엄 릴렉션 미적용)", "2열 통풍시트(쿠션부만)"];
          
          return {
            model_id: "carnival",
            model_name: "카니발",
            category: "대형 RV (MPV)",
            year: 2026,
            variants: [
              // 3.5 가솔린 9인승
              {
                variant_id: "gasoline_3_5_9seat",
                variant_name: "가솔린 3.5 (9인승)",
                vehicle_type: "RV (MPV)",
                fuel: "가솔린",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 9, base_price_5: 3636, base_price_3_5: 3582, engine: "G3.5 GDI (294hp)",
                    fuel_economy: { combined: 9.0, urban: 7.8, highway: 10.9, co2: 189 },
                    standard_features: CARN_9_PRES_F,
                    available_options: ["convenience", "style_pkg", "cluster_12_3", "drive_wise", "monitoring", "hud_builtin_cam"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 9, base_price_5: 4071, base_price_3_5: 4010, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.0, urban: 7.8, highway: 10.9, co2: 189 },
                    standard_features: CARN_9_NOB_F,
                    available_options: ["style_pkg", "comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "rear_ent", "my_comfort"] },
                  { trim_id: "signature", name: "시그니처", seats: 9, base_price_5: 4426, base_price_3_5: 4360, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.0, urban: 7.8, highway: 10.9, co2: 189 },
                    standard_features: CARN_9_SIG_F,
                    available_options: ["style_pkg", "comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "rear_ent", "my_comfort"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 9, base_price_5: 4570, base_price_3_5: 4502, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.0, urban: 7.8, highway: 10.9, co2: 189 },
                    standard_features: CARN_9_XL_F,
                    available_options: ["comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "my_comfort"] }
                ],
                options_master: CARNIVAL_9_OPTIONS,
                exclusive_groups: [
                  { id: "rear_pack", label: "후석 패키지", members: ["rear_ent", "my_comfort"] }
                ]
              },
              // 3.5 가솔린 7인승
              {
                variant_id: "gasoline_3_5_7seat",
                variant_name: "가솔린 3.5 (7인승)",
                vehicle_type: "RV (MPV)",
                fuel: "가솔린",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "noblesse", name: "노블레스", seats: 7, base_price_5: 4331, base_price_3_5: 4266, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.0, urban: 7.8, highway: 10.9, co2: 189 },
                    standard_features: CARN_7_NOB_F,
                    available_options: ["style_pkg", "comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "sunroof_dual", "my_comfort"] },
                  { trim_id: "outdoor", name: "아웃도어", seats: 7, base_price_5: 4231, base_price_3_5: 4168, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.0, urban: 7.8, highway: 10.9, co2: 189 },
                    standard_features: CARN_7_OUTDOOR_F,
                    available_options: ["style_pkg", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "sunroof_dual"] },
                  { trim_id: "signature", name: "시그니처", seats: 7, base_price_5: 4708, base_price_3_5: 4638, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.0, urban: 7.8, highway: 10.9, co2: 189 },
                    standard_features: CARN_9_SIG_F,
                    available_options: ["style_pkg", "comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "rear_ent", "my_comfort"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 7, base_price_5: 4760, base_price_3_5: 4689, engine: "G3.5 GDI",
                    fuel_economy: { combined: 9.0, urban: 7.8, highway: 10.9, co2: 189 },
                    standard_features: CARN_9_XL_F,
                    available_options: ["comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "my_comfort"] }
                ],
                options_master: CARNIVAL_7_OPTIONS,
                exclusive_groups: [
                  { id: "rear_pack", label: "후석 패키지", members: ["rear_ent", "my_comfort"] }
                ]
              },
              // 1.6 터보 하이브리드 9인승 (가솔린 + 455만)
              {
                variant_id: "hybrid_1_6t_9seat",
                variant_name: "터보 하이브리드 1.6 (9인승)",
                vehicle_type: "RV (MPV, 하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1598,
                transmission: "스마트스트림 6AT",
                trims: [
                  { trim_id: "prestige", name: "프레스티지", seats: 9, base_price_5: 4091, base_price_3_5: 4027, engine: "1.6T HEV + 54kW (가솔린 + 455만)",
                    fuel_economy: { combined: 14.0, urban: 14.6, highway: 13.3, co2: 116 },
                    standard_features: ["1.6T HEV + 54kW 모터", "스마트스트림 6AT", ...CARN_9_PRES_F.slice(2)],
                    available_options: ["convenience", "style_pkg", "cluster_12_3", "drive_wise", "monitoring", "hud_builtin_cam"] },
                  { trim_id: "noblesse", name: "노블레스", seats: 9, base_price_5: 4526, base_price_3_5: 4455, engine: "1.6T HEV",
                    fuel_economy: { combined: 14.0, urban: 14.6, highway: 13.3, co2: 116 },
                    standard_features: CARN_9_NOB_F,
                    available_options: ["style_pkg", "comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "rear_ent", "my_comfort"] },
                  { trim_id: "signature", name: "시그니처", seats: 9, base_price_5: 4881, base_price_3_5: 4804, engine: "1.6T HEV",
                    fuel_economy: { combined: 13.5, urban: 14.0, highway: 12.9, co2: 121 },
                    standard_features: CARN_9_SIG_F,
                    available_options: ["style_pkg", "comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "rear_ent", "my_comfort"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 9, base_price_5: 5036, base_price_3_5: 4957, engine: "1.6T HEV",
                    fuel_economy: { combined: 13.5, urban: 14.0, highway: 12.9, co2: 121 },
                    standard_features: CARN_9_XL_F,
                    available_options: ["comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "my_comfort"] }
                ],
                options_master: CARNIVAL_9_OPTIONS,
                exclusive_groups: [
                  { id: "rear_pack", label: "후석 패키지", members: ["rear_ent", "my_comfort"] }
                ]
              },
              // 1.6 터보 하이브리드 7인승 (가솔린 + 450만)
              {
                variant_id: "hybrid_1_6t_7seat",
                variant_name: "터보 하이브리드 1.6 (7인승)",
                vehicle_type: "RV (MPV, 하이브리드)",
                fuel: "하이브리드(가솔린)",
                displacement_cc: 1598,
                transmission: "스마트스트림 6AT",
                trims: [
                  { trim_id: "noblesse", name: "노블레스", seats: 7, base_price_5: 4781, base_price_3_5: 4706, engine: "1.6T HEV + 54kW (가솔린 + 450만)",
                    fuel_economy: { combined: 13.5, urban: 14.0, highway: 12.9, co2: 121 },
                    standard_features: CARN_7_NOB_F,
                    available_options: ["style_pkg", "comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "sunroof_dual", "my_comfort"] },
                  { trim_id: "outdoor", operating: false, name: "아웃도어", seats: 7, base_price_5: 4692, base_price_3_5: 4618, engine: "1.6T HEV",
                    fuel_economy: { combined: 13.5, urban: 14.0, highway: 12.9, co2: 121 },
                    standard_features: CARN_7_OUTDOOR_F,
                    available_options: ["style_pkg", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "sunroof_dual"] },
                  { trim_id: "signature", name: "시그니처", seats: 7, base_price_5: 5158, base_price_3_5: 5077, engine: "1.6T HEV",
                    fuel_economy: { combined: 13.5, urban: 14.0, highway: 12.9, co2: 121 },
                    standard_features: CARN_9_SIG_F,
                    available_options: ["style_pkg", "comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "rear_ent", "my_comfort"] },
                  { trim_id: "x_line", operating: false, name: "X-Line", seats: 7, base_price_5: 5221, base_price_3_5: 5139, engine: "1.6T HEV",
                    fuel_economy: { combined: 13.5, urban: 14.0, highway: 12.9, co2: 121 },
                    standard_features: CARN_9_XL_F,
                    available_options: ["comfort", "smart_connect", "drive_wise", "monitoring", "hud_builtin_cam", "bose_sound", "sunroof_dual", "my_comfort"] }
                ],
                options_master: CARNIVAL_7_OPTIONS,
                exclusive_groups: [
                  { id: "rear_pack", label: "후석 패키지", members: ["rear_ent", "my_comfort"] }
                ]
              }
            ],
            exterior_colors: [
              { name: "아이보리 실버", code: "ISG", hex: "#dcd6c5", price: 0 },
              { name: "스노우 화이트 펄", code: "SWP", hex: "#f7f5f0", price: 8 },
              { name: "오로라 블랙 펄", code: "ABP", hex: "#1a1a1a", price: 0 },
              { name: "판테라 메탈", code: "P2M", hex: "#4a4a4a", price: 0 },
              { name: "세라믹 실버 (X-Line 전용)", code: "C4S", hex: "#b8b6b3", price: 0 }
            ]
          };
        })(),
        
        // ========== K9 ==========
        (() => {
          const K9_OPTIONS = {
            monitoring_pack: { name: "모니터링 팩", sub: "서라운드뷰&후측방 모니터+원격 스마트 주차 보조(직각/평행/출차)+후방 주차 충돌방지+증강현실 내비", price: 178 },
            comfort_pack: { name: "컴포트 팩", sub: "인조가죽 감싸기(크래시패드 상단/도어트림 상단)+후면 전동 선커튼+뒷좌석 측면 수동 선커튼", price: 119 },
            wheel_19: { name: "19\" 휠&타이어", sub: "앞 245/45 R19 + 뒤 275/40 R19 외산 타이어 + 다크 스퍼터링 휠 (3.3T 기본)", price: 79 },
            hud: { name: "헤드업 디스플레이", price: 119 },
            awd: { name: "AWD", sub: "4륜구동 (베스트 셀렉션 Ⅰ/마스터즈/베스트 셀렉션 Ⅱ는 기본)", price: 247 },
            preview_susp: { name: "프리뷰 전자제어 서스펜션", sub: "(3.3T 기본, 3.8 가솔린 베스트 셀렉션 Ⅰ만 옵션)", price: 99 },
            premium_pack: { name: "프리미엄 팩", sub: "퀼팅 나파가죽시트+최고급 가죽 내장재+리얼 우드+앰비언트+인터랙티브 조명", price: 326 },
            lexicon_sound: { name: "Lexicon 프리미엄 사운드", sub: "17스피커+외장앰프 (메탈 도어 스피커 그릴 포함)", price: 138 },
            vip_collection: { name: "VIP 컬렉션", sub: "뒷좌석 파워시트+냉방/통풍+에어셀 허리지지대+화장거울+윙아웃 헤드레스트+동승석 에르고모션+3존 공조 등", price: 366,
              trim_prices: { masters: 307 } },
            rear_dual_monitor: { name: "뒷좌석 듀얼 모니터", sub: "뒷좌석 센터 암레스트 USB(데이터/충전) 포함", price: 247 },
            sunroof: { name: "선루프", price: 79 },
            builtin_cam: { name: "빌트인 캠", sub: "+ 보조배터리", price: 74 }
          };
          
          // 트림 표준사양
          const K9_PLATINUM_F = ["V6 람다Ⅱ 3.8 GDI (315hp/40.5kgf·m)", "8단 자동", "R-MDPS+VGR+전방 예측 변속", "FCA(보행자/차량/자전거/교차/측방/추월/회피)+LKA+LFA+HBA+DAW+SCC+NSCC(안전/곡선/진출입)+HDA2(차로변경)+안전하차+진동경고+RCCA+BCA", "9에어백+VSM+다중 충돌방지", "245/50 R18 외산+전면가공", "프로젝션 LED 헤드램프+LED 턴시그널+DRL+리어콤비+보조제동등", "에어로 와이퍼+듀얼머플러", "다이내믹 웰컴+터치 도어핸들+후진 가이드", "윈드실드/1열/2열/백라이트 이중접합 차음+자외선 차단", "블랙/마션 브라운/베이지 인테리어 선택", "7\" 슈퍼비전 클러스터", "ECM 룸미러", "가죽 스티어링+내추럴 우드그레인+메탈 페달", "양문형 콘솔암레스트", "가죽시트", "1열 파워+1열 통풍/열선+2열 열선", "동승석 워크인", "운전석 에어셀 허리지지대", "버튼시동 스마트키", "하이패스", "EPB(오토홀드)", "1열 무선충전", "스마트 파워 트렁크", "독립 풀오토 에어컨(1열/2열)", "메모리+이지억세스", "지문인증+디지털 키", "14.5\" 내비+필기인식", "KRELL 14스피커+외장앰프+액티브 엔진 사운드"];
          const K9_BEST1_F = ["+모니터링 팩 (서라운드뷰/후측방/원격주차)", "+컴포트 팩 (전동 선커튼/2열 선커튼)", "19\" 다크 스퍼터링 휠", "헤드업 디스플레이", "AWD", "12.3\" 슈퍼비전 클러스터"];
          const K9_MASTERS_F = ["+프리뷰 전자제어 서스펜션", "AWD 기본", "프리 액티브 시트벨트+후방 주차 충돌방지", "19\" 다크 스퍼터링 휠", "12.3\" 슈퍼비전 클러스터", "인조가죽 크래시패드+스웨이드 트림", "운전석 에르고 모션시트+전동 익스텐션+볼스터 전동", "동승석 메모리시트", "HUD+서라운드뷰+후측방 모니터+원격 스마트 주차 보조", "파워도어+2열 측면 선커튼+후면 전동 선커튼", "지능형 헤드램프", "동승석 이지억세스", "증강현실 내비"];
          const K9_BEST2_F = ["+프리미엄 팩 (퀼팅 나파+최고급 가죽+리얼 우드+앰비언트)", "Lexicon 17스피커", "VIP 컬렉션 (뒷좌석 파워/통풍/에어셀 허리지지대 + 동승석 에르고모션 + 3존 공조)", "뒷좌석 스마트폰 무선충전", "뒷좌석 우측 전동틸팅", "뒷좌석 숄더 전동조절+전동식 헤드레스트"];
          
          return {
            model_id: "k9",
            model_name: "K9",
            category: "대형 세단 (플래그십)",
            year: 2026,
            variants: [
              // 3.8 가솔린
              {
                variant_id: "gasoline_3_8",
                variant_name: "가솔린 3.8",
                vehicle_type: "세단",
                fuel: "가솔린",
                displacement_cc: 3778,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "platinum", name: "플래티넘", seats: 5, base_price_5: 5962, base_price_3_5: 5873, engine: "V6 람다Ⅱ 3.8 GDI (315hp)",
                    fuel_economy: { combined: 9.0, urban: 7.8, highway: 11.0, co2: 192 },
                    standard_features: K9_PLATINUM_F,
                    available_options: ["monitoring_pack", "comfort_pack", "wheel_19", "hud", "awd", "sunroof", "builtin_cam"] },
                  { trim_id: "best_selection_1", operating: false, name: "베스트 셀렉션 Ⅰ", seats: 5, base_price_5: 6766, base_price_3_5: 6665, engine: "V6 3.8 GDI + AWD",
                    fuel_economy: { combined: 8.3, urban: 7.3, highway: 10.1, co2: 207 },
                    standard_features: K9_BEST1_F,
                    available_options: ["premium_pack", "lexicon_sound", "vip_collection", "preview_susp", "rear_dual_monitor", "sunroof", "builtin_cam"] },
                  { trim_id: "masters", operating: false, name: "마스터즈", seats: 5, base_price_5: 7507, base_price_3_5: 7395, engine: "V6 3.8 GDI + AWD + 프리뷰 서스",
                    fuel_economy: { combined: 8.3, urban: 7.3, highway: 10.1, co2: 207 },
                    standard_features: K9_MASTERS_F,
                    available_options: ["premium_pack", "lexicon_sound", "vip_collection", "rear_dual_monitor", "sunroof", "builtin_cam"] },
                  { trim_id: "best_selection_2", operating: false, name: "베스트 셀렉션 Ⅱ", seats: 5, base_price_5: 8335, base_price_3_5: 8210, engine: "V6 3.8 GDI 풀옵션",
                    fuel_economy: { combined: 8.3, urban: 7.3, highway: 10.1, co2: 207 },
                    standard_features: K9_BEST2_F,
                    available_options: ["rear_dual_monitor", "sunroof", "builtin_cam"] }
                ],
                options_master: K9_OPTIONS
              },
              // 3.3 가솔린 터보 (프리뷰 서스 + 19" 휠 기본)
              {
                variant_id: "gasoline_3_3t",
                variant_name: "가솔린 3.3 터보",
                vehicle_type: "세단",
                fuel: "가솔린",
                displacement_cc: 3342,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "platinum", name: "플래티넘", seats: 5, base_price_5: 6617, base_price_3_5: 6518, engine: "V6 람다Ⅱ 3.3 T-GDI (370hp/52.0kgf·m)",
                    fuel_economy: { combined: 8.7, urban: 7.4, highway: 10.9, co2: 199 },
                    standard_features: ["V6 람다Ⅱ 3.3 T-GDI (370hp)", "프리뷰 전자제어 서스펜션", "19\" 다크 스퍼터링", ...K9_PLATINUM_F.slice(1)],
                    available_options: ["monitoring_pack", "comfort_pack", "hud", "awd", "rear_dual_monitor", "sunroof", "builtin_cam"] },
                  { trim_id: "best_selection_1", operating: false, name: "베스트 셀렉션 Ⅰ", seats: 5, base_price_5: 7351, base_price_3_5: 7241, engine: "V6 3.3 T-GDI + AWD",
                    fuel_economy: { combined: 8.1, urban: 7.0, highway: 10.1, co2: 213 },
                    standard_features: ["+모니터링 팩", "+컴포트 팩", "헤드업 디스플레이", "AWD", "12.3\" 슈퍼비전 클러스터"],
                    available_options: ["premium_pack", "lexicon_sound", "vip_collection", "rear_dual_monitor", "sunroof", "builtin_cam"] },
                  { trim_id: "masters", operating: false, name: "마스터즈", seats: 5, base_price_5: 7990, base_price_3_5: 7870, engine: "V6 3.3 T-GDI + AWD",
                    fuel_economy: { combined: 8.1, urban: 7.0, highway: 10.1, co2: 213 },
                    standard_features: K9_MASTERS_F,
                    available_options: ["premium_pack", "lexicon_sound", "vip_collection", "rear_dual_monitor", "sunroof", "builtin_cam"] },
                  { trim_id: "best_selection_2", operating: false, name: "베스트 셀렉션 Ⅱ", seats: 5, base_price_5: 8817, base_price_3_5: 8685, engine: "V6 3.3 T-GDI 풀옵션",
                    fuel_economy: { combined: 8.1, urban: 7.0, highway: 10.1, co2: 213 },
                    standard_features: K9_BEST2_F,
                    available_options: ["rear_dual_monitor", "sunroof", "builtin_cam"] }
                ],
                options_master: K9_OPTIONS
              }
            ],
            exterior_colors: [
              { name: "스노우 화이트 펄", code: "SWP", hex: "#f7f5f0", price: 8 },
              { name: "페블 그레이", code: "DFG", hex: "#8a8a85", price: 0 },
              { name: "오로라 블랙 펄", code: "ABP", hex: "#1a1a1a", price: 0 },
              { name: "딥 크로마 블루", code: "D9B", hex: "#2a3a5a", price: 0 },
              { name: "판테라 메탈", code: "P2M", hex: "#4a4a4a", price: 0 }
            ]
          };
        })()
      ]
    },
    {
      manufacturer_id: "genesis",
      manufacturer_name: "제네시스",
      models: [
        // ========== G70 (2026.5.1 PDF) ==========
        (() => {
          const G70_OPTIONS = {
            awd: { name: "AWD", sub: "전자제어 풀타임 4WD", price: 247 },
            engine_3_3t: { name: "가솔린 3.3 터보 엔진", sub: "19\" 미쉐린 타이어&휠 + 전자제어 서스펜션 포함", price: 495 },
            sport_pkg_2_5: { name: "스포츠 패키지 (2.5T)", sub: "전자제어 서스펜션+브렘보 레드캘리퍼+LSD+19\" 미쉐린+스포츠 내외장 (2WD)", price: 356,
              requires_in_trim: {} },
            sport_pkg_2_5_awd: { name: "스포츠 패키지 (2.5T AWD)", sub: "전자제어 서스펜션+브렘보 레드캘리퍼+19\" 미쉐린+스포츠 내외장 (LSD 미적용)", price: 336 },
            sport_pkg_3_3: { name: "스포츠 패키지 (3.3T)", sub: "전자제어 서스펜션+브렘보 레드캘리퍼+LSD+가변 배기+19\" 미쉐린+스포츠 내외장", price: 237 },
            wheel_19_dia: { name: "19\" 다이아몬드 컷팅 휠 (미쉐린)", sub: "2.5T 전용", price: 69 },
            sport_design: { name: "스포츠 디자인 셀렉션", sub: "스포츠 전용 나파가죽 퀼팅+스웨이드 내장재+혼커버 가죽 (스포츠 패키지 필요)", price: 148 },
            leather_pkg: { name: "천연 가죽 패키지", sub: "천연가죽 시트+다이아몬드 패턴 알루미늄 내장재", price: 119 },
            signature_design: { name: "시그니쳐 디자인 셀렉션", sub: "나파가죽 퀼팅 시트+다이아몬드 패턴 알루미늄+스웨이드 내장재", price: 237 },
            popular_pkg: { name: "파퓰러 패키지", sub: "컨비니언스+하이테크+드라이빙 어시스턴스", price: 410 },
            convenience_pkg: { name: "컨비니언스 패키지", sub: "스마트 전동 트렁크+디지털키2+앞좌석 무선충전", price: 129 },
            hitech_pkg: { name: "하이테크 패키지", sub: "12.3\" 3D 클러스터+지능형 헤드램프", price: 158 },
            driving_assist: { name: "드라이빙 어시스턴스 패키지", sub: "SVM+BVM+빌트인 캠+보조배터리", price: 168 },
            lexicon_audio: { name: "렉시콘 사운드 패키지", sub: "렉시콘 15스피커(퀀텀 로직 서라운드)", price: 119 },
            electronic_susp: { name: "전자제어 서스펜션", sub: "2.5T 전용 (3.3T 기본)", price: 99 },
            wide_sunroof: { name: "와이드 선루프", price: 79 }
          };
          
          const G70_OPTIONS_GRAPHITE = {
            awd: { name: "AWD", sub: "전자제어 풀타임 4WD", price: 247 },
            wide_sunroof: { name: "와이드 선루프", price: 79 }
          };
          
          const G70_STANDARD_FEATURES = ["가솔린 2.5 터보 + 8단 자동", "ISG", "통합 주행모드(에코/컴포트/스포츠/스포츠+/커스텀)", "Full LED 헤드램프", "Full LED 리어콤비", "225/45R18 브리지스톤", "이중접합 차음유리(앞/도어)", "자외선 차단 유리(앞)", "브렘보 실버 4P 모노블럭 브레이크", "듀얼 머플러", "8\" TFT LCD 클러스터", "전자식 변속레버(SBW)", "패들쉬프트", "하이패스", "ECM 룸미러", "터치타입 공조 패널", "메탈 도어 스텝", "10에어백", "급제동 경보", "뒷좌석 센터 3점식 시트벨트", "LKA/LFA/HBA/DAW/ISLA", "FCA(차량/보행자/자전거/교차로)", "BCA/RCCA", "후진 가이드 램프", "안전 하차 경고", "후석 승객 알림", "다중 충돌방지 자동제동", "차량용 소화기", "터치타입 도어 핸들", "레인센서", "열선 스티어링", "듀얼 풀오토 에어컨", "공기청정 시스템", "HDA", "SCC(스탑앤고)", "NSCC(안전구간/곡선로)", "LFA", "조향연동 후방 모니터", "EPB(오토홀드)", "전동식 조절 스티어링", "운전석 인텔리전트 시트(16way+볼스터)", "운전석 자세 메모리", "동승석 8way+럼버서포트+워크인", "앞좌석 통풍/열선", "뒷좌석 열선", "뒷좌석 6:4 폴딩", "HUD", "스마트 트렁크", "10.25\" 디스플레이", "Genesis Connected Services 5년 무료", "인카페이먼트", "발레 모드", "스트리밍 서비스(베이직 요금제 5년 무료)", "OTA 업데이트", "레퍼런스 9스피커"];
          
          const G70_GRAPHITE_FEATURES = ["가솔린 3.3 터보 + 8단 자동", "지능형 헤드램프", "19\" 다크 스퍼터링 휠 + 썸머 타이어", "브렘보 블랙 4P 모노블럭", "가변 배기 머플러", "에디션 전용 스포츠 나파가죽 시트(퀼팅)+스웨이드 내장재", "다크 스트라이프 패턴 알루미늄 내장재", "12.3\" 3D 클러스터", "차동제한장치(LSD)", "전용 전자제어 서스펜션", "스마트 전동 트렁크", "디지털키 2 터치", "앞좌석 무선충전", "빌트인 캠 + 보조배터리", "SVM/BVM/측방경고/RPCA", "HDA/SCC/NSCC", "BCA/RCCA/SEW", "렉시콘 15스피커", "Genesis Connected Services 5년 무료"];
          
          return {
            model_id: "g70",
            model_name: "G70",
            category: "프리미엄 스포츠 세단",
            year: 2026,
            variants: [
              {
                variant_id: "g70_2_5t",
                variant_name: "G70 가솔린 2.5 터보",
                vehicle_type: "세단",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "standard", name: "스탠다드", seats: 5,
                    base_price_5: 4506, base_price_3_5: 4438,
                    engine: "스마트스트림 G 2.5 T-GDI (304hp/43kgf·m)",
                    fuel_economy: { combined: 11.2, urban: 10.0, highway: 13.1, co2: 150 },
                    standard_features: G70_STANDARD_FEATURES,
                    available_options: ["awd", "engine_3_3t", "sport_pkg_2_5", "wheel_19_dia", "leather_pkg", "signature_design", "popular_pkg", "lexicon_audio", "electronic_susp", "wide_sunroof"] }
                ],
                options_master: G70_OPTIONS,
                exclusive_groups: [
                  { id: "design", label: "내장 디자인", members: ["leather_pkg", "signature_design", "sport_design"] }
                ]
              },
              {
                variant_id: "g70_3_3t",
                variant_name: "G70 가솔린 3.3 터보",
                vehicle_type: "세단 (고성능)",
                fuel: "가솔린",
                displacement_cc: 3342,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "standard", name: "스탠다드", seats: 5,
                    base_price_5: 5001, base_price_3_5: 4925,
                    engine: "스마트스트림 G 3.3 T-GDI (370hp/52kgf·m)",
                    fuel_economy: { combined: 9.1, urban: 8.0, highway: 10.8, co2: 185 },
                    standard_features: [...G70_STANDARD_FEATURES, "19\" 다이아몬드 컷팅 휠+미쉐린 타이어", "전자제어 서스펜션"],
                    available_options: ["awd", "sport_pkg_3_3", "leather_pkg", "signature_design", "popular_pkg", "lexicon_audio", "wide_sunroof"] }
                ],
                options_master: G70_OPTIONS,
                exclusive_groups: [
                  { id: "design", label: "내장 디자인", members: ["leather_pkg", "signature_design"] }
                ]
              },
              {
                variant_id: "g70_graphite",
                variant_name: "G70 그래파이트 에디션",
                vehicle_type: "세단 (고성능 에디션)",
                fuel: "가솔린",
                displacement_cc: 3342,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "graphite", operating: false, name: "Graphite Edition", seats: 5,
                    base_price_5: 5977, base_price_3_5: 5886,
                    engine: "스마트스트림 G 3.3 T-GDI (373hp/52kgf·m)",
                    fuel_economy: { combined: 8.9, urban: 7.9, highway: 10.6, co2: 190 },
                    standard_features: G70_GRAPHITE_FEATURES,
                    available_options: ["awd", "wide_sunroof"] }
                ],
                options_master: G70_OPTIONS_GRAPHITE
              }
            ],
            exterior_colors: [
              { name: "우유니 화이트", code: "UYH", hex: "#f7f4ec", price: 0 },
              { name: "바트나 그레이", code: "GRY", hex: "#b7b8b8", price: 0 },
              { name: "세빌 실버", code: "SSS", hex: "#9d9e9f", price: 0 },
              { name: "마칼루 그레이 (글로시)", code: "NCM", hex: "#5b5e60", price: 0 },
              { name: "비크 블랙", code: "PH3", hex: "#1a1a1d", price: 0 },
              { name: "태즈먼 블루", code: "URA", hex: "#1d3550", price: 0 },
              { name: "카프리 블루", code: "NRB", hex: "#0e3a5a", price: 0 },
              { name: "본드 실버 매트(무광)", code: "SMT", hex: "#787a7c", price: 69 },
              { name: "마칼루 그레이 매트(무광)", code: "MPE", hex: "#4f5253", price: 69 },
              { name: "벌리 블루 매트(무광)", code: "MBM", hex: "#13284a", price: 69 }
            ]
          };
        })(),
        
        // ========== G80 (2026.5.1 PDF) ==========
        (() => {
          const G80_OPTIONS = {
            engine_3_5t: { name: "가솔린 3.5 터보 엔진", sub: "프리뷰 전자제어 서스펜션+19\" 콘티넨탈 타이어&휠 기본 적용", price: 660 },
            awd: { name: "AWD", sub: "전자제어 풀타임 4WD", price: 280 },
            popular_pkg: { name: "파퓰러 패키지", sub: "드라이빙 어시Ⅰ+드라이빙 어시Ⅱ+빌트인 캠 패키지", price: 430 },
            convenience_pkg: { name: "컨비니언스 패키지", sub: "동승석 에르고모션+고스트 도어 클로징+항균 패키지", price: 130 },
            driving_assist_1: { name: "드라이빙 어시스턴스 패키지Ⅰ", sub: "SVM+BVM+측방경고+주차충돌방지(전/측/후)+RSPA2", price: 195 },
            driving_assist_2: { name: "드라이빙 어시스턴스 패키지Ⅱ", sub: "FCA2(교차/추월/측방)+SCC(스타일연동)+NSCC(진출입로)+HDA2+프리액티브 시트벨트+BCA(주행)+지능형 헤드램프", price: 200 },
            comfort_2nd_row: { name: "2열 컴포트 패키지", sub: "3존+ 공조+2열 전동/통풍+목베개+뒷좌석 무선충전+화장거울", price: 270 },
            bno_sound: { name: "뱅앤올룹슨 사운드 패키지", sub: "B&O 18스피커+ANC-R", price: 190 },
            builtin_cam_pkg: { name: "빌트인 캠 패키지", sub: "빌트인 캠2+보조배터리+증강현실 내비", price: 85 },
            preview_susp: { name: "프리뷰 전자제어 서스펜션", sub: "2.5T 18/19\" 휠 선택 시 (3.5T 기본)", price: 110 },
            wide_sunroof: { name: "와이드 선루프", price: 140 },
            wheel_19_2_5t: { name: "19\" 콘티넨탈 타이어&휠", sub: "2.5T - 하이퍼실버/다이아 컷팅(B)/다이아 컷팅(C) 중 택1", price: 120 },
            wheel_20_2_5t: { name: "20\" 피렐리 타이어&휠", sub: "2.5T - 프리뷰 ECS 포함", price: 300 },
            wheel_20_3_5t: { name: "20\" 피렐리 타이어&휠", sub: "3.5T 전용", price: 70 },
            sport_pkg_2_5: { name: "스포츠 패키지 (2.5T)", sub: "프리뷰 ECS+20\" 피렐리+블랙 4P+스포츠 내외장", price: 400 },
            sport_pkg_3_5: { name: "스포츠 패키지 (3.5T)", sub: "20\" 미쉐린+블랙 4P+스포츠+모드+런치컨트롤+후륜 조향+e-LSD+B&O 포함+스포츠 내외장", price: 560 },
            signature_1: { name: "시그니쳐 디자인 셀렉션Ⅰ", sub: "천연가죽 퀼팅 시트+헤어라인 알루미늄 내장재+인조가죽 크래쉬패드", price: 150 },
            signature_2: { name: "시그니쳐 디자인 셀렉션Ⅱ", sub: "프라임 나파가죽 퀼팅 시트+리얼 우드+투톤 스티어링+스웨이드 내장재", price: 300 },
            sport_design_sel: { name: "스포츠 디자인 셀렉션", sub: "프라임 나파가죽 퀼팅 시트+카본 내장재+투톤 스티어링+스웨이드 내장재 (스포츠 패키지 필요)", price: 270 },
            rear_entertainment: { name: "후석 스마트 엔터테인먼트", sub: "14.6\" 스마트 듀얼 모니터+스트리밍 서비스", price: 300 },
            protect_film: { name: "차량 보호 필름", price: 45 },
            floating_cap: { name: "플로팅 휠 캡", price: 9 }
          };
          
          const G80_BLACK_OPTIONS = {
            engine_3_5t_black: { name: "가솔린 3.5 터보 엔진 (Black 전용)", price: 430 },
            wide_sunroof: { name: "와이드 선루프", price: 140 },
            rear_entertainment: { name: "후석 스마트 엔터테인먼트", sub: "14.6\" 스마트 듀얼 모니터", price: 300 },
            protect_film: { name: "차량 보호 필름", price: 45 }
          };
          
          const G80_STANDARD_F = ["가솔린 2.5 터보 + 8단 자동", "ISG", "통합 주행모드", "전륜 모노블럭 4P 브레이크", "후륜 스타일링 커버", "MLA 헤드램프", "Full LED 리어콤비", "245/50R18 피렐리", "이중접합 차음유리(앞/도어)", "자외선 차단유리(앞/뒤/도어)", "히든 머플러", "다이내믹 웰컴 라이트(전면)", "27\" OLED 통합 디스플레이", "전자식 변속 다이얼(SBW)", "패들쉬프트", "하이패스", "프레임리스 ECM 룸미러", "G-Matrix 패턴 인서트 필름+블랙 하이글로시 내장재", "터치타입 공조 패널", "앰비언트 무드램프", "10에어백", "급제동 경보", "LKA/LFA/HBA/DAW/ISLA", "FCA(차량/보행자/자전거/교차로)", "BCA/RCCA/SEW", "후진 가이드 램프", "안전 하차 보조", "어드밴스드 후석승객알림", "다중 충돌방지 자동제동", "차량용 소화기", "앞좌석 무선충전", "디지털키 2", "터치타입 도어 핸들", "전자식 파워 차일드 락", "레인센서", "열선/전동 스티어링", "실내 지문인증", "독립제어 풀오토 에어컨", "공기청정 시스템", "HDA", "SCC(스탑앤고)", "NSCC(안전구간/곡선로)", "LFA2", "조향연동 후방모니터", "EPB(오토홀드)", "스마트 트렁크", "뒷면 전동 커튼", "뒷좌석 수동 도어커튼", "뒷좌석 다기능 암레스트", "HUD", "천연가죽 시트", "운전석 에르고모션 시트(18way)", "동승석 12way+럼버서포트+워크인", "운/동승 자세 메모리", "앞좌석 통풍/열선", "앞좌석 콘솔 암레스트 열선", "뒷좌석 열선", "뒷좌석 스키쓰루", "Genesis Connected Services 5년 무료", "인카페이먼트", "발레 모드", "스트리밍 서비스(플러스 요금제 5년 무료)", "OTA", "레퍼런스 9스피커"];
          
          const G80_BLACK_F = ["+G80 Black 전용 디자인(라디에이터 그릴/범퍼몰딩/엠블럼/레터링/DLO 몰딩/플로팅 휠 캡)", "AWD (기본)", "프리뷰 전자제어 서스펜션", "전륜 블랙 4P 모노블럭", "245/40R20+275/35R20 피렐리+Black 전용 휠", "블랙 애쉬 우드 내장재", "전용 프라임 나파가죽 시트(Black 전용 퀼팅/파이핑)", "동승석 에르고모션(18way)+2열 전동/통풍+뒷좌석 목베개", "고스트 도어 클로징", "SVM+BVM+측방경고+주차충돌방지(전/측/후)+RSPA2", "FCA2(교차/추월/측방)+SCC(스타일연동)+NSCC(진출입로)+HDA2+프리액티브 시트벨트+BCA(주행)+지능형 헤드램프", "3존+ 공조", "항균 패키지", "뒷좌석 무선충전", "빌트인 캠2+보조배터리+AR 내비", "뒷좌석 화장거울", "뱅앤올룹슨 18스피커+ANC-R"];
          
          return {
            model_id: "g80",
            model_name: "G80",
            category: "프리미엄 럭셔리 세단",
            year: 2026,
            variants: [
              {
                variant_id: "g80_2_5t",
                variant_name: "G80 가솔린 2.5/3.5 터보",
                vehicle_type: "프리미엄 세단",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "standard", name: "스탠다드", seats: 5,
                    base_price_5: 6070, base_price_3_5: 5978,
                    engine: "스마트스트림 G 2.5 T-GDI (304hp) / 3.5 T-GDI (380hp) 옵션",
                    fuel_economy: { combined: 10.5, urban: 9.1, highway: 13.2, co2: 159 },
                    standard_features: G80_STANDARD_F,
                    available_options: ["engine_3_5t", "awd", "popular_pkg", "convenience_pkg", "driving_assist_1", "driving_assist_2", "comfort_2nd_row", "bno_sound", "builtin_cam_pkg", "preview_susp", "wide_sunroof", "wheel_19_2_5t", "wheel_20_2_5t", "sport_pkg_2_5", "signature_1", "signature_2", "rear_entertainment"] }
                ],
                options_master: G80_OPTIONS,
                exclusive_groups: [
                  { id: "wheels_2_5", label: "휠 사이즈", members: ["wheel_19_2_5t", "wheel_20_2_5t"] },
                  { id: "popular_vs_individual", label: "파퓰러 vs 개별", members: ["popular_pkg", "driving_assist_1", "driving_assist_2", "builtin_cam_pkg"] },
                  { id: "design_sel", label: "내장 디자인", members: ["signature_1", "signature_2"] }
                ],
                option_excludes: {
                  "popular_pkg": ["driving_assist_1", "driving_assist_2", "builtin_cam_pkg"],
                  "sport_pkg_2_5": ["wheel_19_2_5t", "wheel_20_2_5t", "preview_susp", "signature_1", "signature_2"],
                  "engine_3_5t": ["preview_susp", "wheel_19_2_5t", "wheel_20_2_5t"]
                }
              },
              {
                variant_id: "g80_black",
                variant_name: "G80 Black",
                vehicle_type: "프리미엄 세단 (Black 에디션, AWD 기본)",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "black", name: "Black", seats: 5,
                    base_price_5: 8370, base_price_3_5: 8243,
                    engine: "스마트스트림 G 2.5 T-GDI (304hp) / 3.5 T-GDI (380hp) 옵션",
                    fuel_economy: { combined: 9.4, urban: 8.1, highway: 11.7, co2: 179 },
                    standard_features: G80_BLACK_F,
                    available_options: ["engine_3_5t_black", "wide_sunroof", "rear_entertainment"] }
                ],
                options_master: G80_BLACK_OPTIONS
              }
            ],
            exterior_colors: [
              { name: "우유니 화이트", code: "UYH", hex: "#f7f4ec", price: 0 },
              { name: "바트나 그레이", code: "GRY", hex: "#b7b8b8", price: 0 },
              { name: "세빌 실버", code: "SSS", hex: "#9d9e9f", price: 0 },
              { name: "마칼루 그레이 (글로시)", code: "NCM", hex: "#5b5e60", price: 0 },
              { name: "비크 블랙", code: "PH3", hex: "#1a1a1d", price: 0 },
              { name: "세레스 블루", code: "ASA", hex: "#2c5a7e", price: 0 },
              { name: "태즈먼 블루", code: "URA", hex: "#1d3550", price: 0 },
              { name: "마칼루 그레이 매트(무광)", code: "MPE", hex: "#4f5253", price: 70 }
            ]
          };
        })(),
        
        // ========== G90 (2026.5.1 PDF, 4 sub-models) ==========
        (() => {
          const G90_OPTIONS = {
            engine_esc: { name: "가솔린 3.5 터보 48V 일렉트릭 슈퍼차저", sub: "20\" 미쉐린 타이어&휠 포함", price: 600 },
            awd: { name: "AWD", sub: "3.5T 스탠다드용", price: 350 },
            vip_4seat: { name: "퍼스트 클래스 VIP 시트 (4인승)", sub: "뒷좌석 컴포트 패키지Ⅰ 필요", price: 340 },
            signature_design: { name: "시그니쳐 디자인 셀렉션", sub: "프라임 나파가죽 퀼팅+오픈포어 리얼우드+스웨이드 내장재", price: 550 },
            signature_metal: { name: "메탈 G-Matrix 패턴 내장재", sub: "오픈포어 리얼우드 대체 (시그니쳐 디자인 셀렉션 선택 시)", price: 100 },
            popular_collection: { name: "파퓰러 컬렉션", sub: "앞좌석 컴포트+뒷좌석 컴포트Ⅰ", price: 560 },
            premium_collection: { name: "프리미엄 컬렉션", sub: "+시그니쳐 디자인+이지 클로즈+멀티챔버 에어 서스펜션+후륜 조향", price: 1710 },
            prestige_collection: { name: "프레스티지 컬렉션", sub: "+뒷좌석 컴포트Ⅱ+후석 엔터테인먼트", price: 2300 },
            front_comfort: { name: "앞좌석 컴포트 패키지", sub: "지능형 헤드램프+운/동승 에르고 릴렉싱(22/20way 마사지)", price: 250 },
            rear_comfort_1: { name: "뒷좌석 컴포트 패키지Ⅰ", sub: "뒷좌석 16way 전동+VIP 레그레스트+통풍+3존+ 공조+목베개+무선충전+자세 메모리", price: 350 },
            rear_comfort_2: { name: "뒷좌석 컴포트 패키지Ⅱ", sub: "에르고 릴렉싱(마사지/풋레스트)+프라이버시 글라스 (뒷좌석 컴포트Ⅰ 필요)", price: 290 },
            bno_sound: { name: "뱅앤올룹슨 사운드 패키지", sub: "B&O 23스피커+버추얼 베뉴", price: 390 },
            multi_air_susp: { name: "멀티 챔버 에어 서스펜션", price: 350 },
            rear_steering: { name: "후륜 조향 시스템", sub: "멀티 챔버 에어 서스펜션 필요", price: 150 },
            easy_close: { name: "이지 클로즈 시스템", price: 150 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 200 },
            builtin_cam: { name: "빌트인 캠 패키지", sub: "빌트인 캠+보조배터리", price: 80 },
            rear_entertainment: { name: "전동식 후석 스마트 엔터테인먼트", sub: "14.6\" 듀얼 모니터+스트리밍", price: 310 },
            protect_film: { name: "차량 보호 필름", price: 54 },
            floating_cap_pedal: { name: "플로팅 휠 캡 & 메탈 페달", price: 20 }
          };
          
          const G90_LWB_OPTIONS = {
            vip_4seat: { name: "퍼스트 클래스 VIP 시트 (4인승)", sub: "뒷좌석 컴포트 패키지 필요", price: 390 },
            signature_metal: { name: "메탈 G-Matrix 패턴 내장재", sub: "오픈포어 리얼우드 대체", price: 100 },
            rear_comfort_lwb: { name: "뒷좌석 컴포트 패키지", sub: "에르고 릴렉싱 16way+레그레스트+풋레스트+윙아웃 헤드레스트+무선충전+자세 메모리+프라이버시 글라스", price: 500 },
            builtin_cam: { name: "빌트인 캠 패키지", price: 80 },
            panoramic_sunroof_lwb: { name: "파노라마 선루프", price: 250 },
            rear_entertainment: { name: "전동식 후석 스마트 엔터테인먼트", price: 310 },
            protect_film: { name: "차량 보호 필름", price: 54 },
            floating_cap_pedal: { name: "플로팅 휠 캡 & 메탈 페달", price: 20 }
          };
          
          const G90_BLACK_OPTIONS = {
            engine_esc_black: { name: "가솔린 3.5 터보 48V e-슈퍼차저 (Black)", sub: "21\" 미쉐린 타이어&휠 포함", price: 620 },
            vip_4seat_black: { name: "퍼스트 클래스 VIP 시트 (4인승)", price: 340 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 200 },
            builtin_cam: { name: "빌트인 캠 패키지", price: 80 },
            rear_entertainment: { name: "전동식 후석 스마트 엔터테인먼트", price: 310 },
            protect_film: { name: "차량 보호 필름", price: 54 }
          };
          
          const G90_LWB_BLACK_OPTIONS = {
            vip_4seat_black: { name: "퍼스트 클래스 VIP 시트 (4인승)", price: 390 },
            panoramic_sunroof_lwb: { name: "파노라마 선루프", price: 250 },
            builtin_cam: { name: "빌트인 캠 패키지", price: 80 },
            rear_entertainment: { name: "전동식 후석 스마트 엔터테인먼트", price: 310 },
            protect_film: { name: "차량 보호 필름", price: 54 }
          };
          
          const G90_STANDARD_F = ["가솔린 3.5 T-GDI (380hp/54kgf·m) + 8단 자동", "프리뷰 전자제어 서스펜션", "ISG", "통합 주행모드", "MLA 헤드램프", "Full LED 리어콤비", "245/50R19 피렐리+다이아몬드 컷팅 휠", "이중접합 차음유리(앞/뒤/도어)", "자외선 차단 유리(앞/뒤/도어)", "듀얼 머플러", "다이내믹 웰컴 라이트", "12.3\" TFT LCD 클러스터", "12.3\" 디스플레이", "전자식 변속 다이얼(SBW)", "패들쉬프트", "하이패스", "프레임리스 ECM 룸미러", "인서트 필름 내장재", "터치타입 공조 패널", "앰비언트 무드램프", "메탈 도어 스텝", "뒷좌석 화장거울", "10에어백", "급제동 경보", "뒷좌석 센터 3점식 시트벨트", "FCA2(차량/보행자/자전거/교차/추월/측방)", "HBA/DAW/ISLA", "BCA/RCCA/SEW", "후진 가이드 램프", "안전 하차 보조", "어드밴스드 후석승객알림", "다중 충돌방지 자동제동", "주차충돌방지(전/측/후)", "프리액티브 시트벨트", "차량용 소화기", "앞좌석 무선충전", "디지털키 2", "오토 플러시 도어 핸들", "전자식 파워 차일드 락", "레인센서", "열선/전동 스티어링", "실내 지문인증", "3존 공조", "공기청정 시스템", "HDA2", "SCC(스타일연동)", "NSCC(안전구간/곡선/진출입로)", "LFA", "ANC-R", "항균 패키지", "조향연동 후방모니터", "EPB(오토홀드)", "스마트 트렁크", "뒷좌석 전동 도어커튼", "뒷면 전동 커튼", "전자식 도어 래치", "SVM/BVM/RSPA2(주차 구획선/사선 주차)", "AR 내비", "고스트 도어 클로징", "HUD", "천연가죽 시트", "운전석 18way+동승석 16way 전동(헤드레스트/럼버서포트/쿠션 익스텐션)", "운/동승 자세 메모리", "앞좌석 통풍/열선", "뒷좌석 열선", "뒷좌석 스키쓰루", "Genesis Connected Services 5년 무료", "도로파손/미끄럼 알림", "인카페이먼트", "발레 모드", "스트리밍 서비스(플러스 요금제 5년 무료)", "OTA", "B&O 15스피커", "8\" 뒷좌석 암레스트 터치 디스플레이", "무드 큐레이터(향기 카트리지 3EA)"];
          
          const G90_LWB_F = ["+롱휠베이스 (휠베이스 +190mm)", "가솔린 3.5 T-GDI + 48V e-슈퍼차저 (415hp/56kgf·m)", "AWD (기본)", "멀티 챔버 에어 서스펜션", "후륜 조향 시스템", "245/45R20+275/40R20 미쉐린+LWB 전용 다이아 컷팅 휠", "프론트/리어 범퍼 크롬 몰딩", "B필라 알루미늄 아노다이징", "지능형 헤드램프", "어드밴스드 3존+ 공조 (B필라 에어벤트)", "이지 클로즈 시스템", "세미 애닐린 가죽 시트", "운/동승 에르고 릴렉싱(22/20way 마사지)", "뒷좌석 고정 통풍 시트", "뒷좌석 목베개", "뱅앤올룹슨 프리미어 3D 23스피커+버추얼 베뉴", "시그니쳐 디자인 셀렉션 (LWB 전용)"];
          
          const G90_BLACK_F = ["+G90 Black 전용 디자인(프론트 범퍼 그릴/라디에이터 그릴/엠블럼/레터링/DLO 몰딩/머플러 팁/브레이크 캘리퍼/플로팅 휠 캡)", "AWD (기본)", "멀티 챔버 에어 서스펜션 (기본)", "후륜 조향 시스템 (기본)", "245/45R20+275/40R20 미쉐린+20\" 다크 스퍼터링 휠 (Black 전용)", "지능형 헤드램프", "어드밴스드 3존+ 공조", "이지 클로즈 시스템", "Black 전용 세미 애닐린 가죽 (Black 전용 퀼팅)", "운/동승 에르고 릴렉싱(22/20way 마사지)", "뒷좌석 에르고 릴렉싱(16way 마사지)+VIP 레그레스트+토퍼", "뒷좌석 통풍/윙아웃 헤드레스트/목베개", "뒷좌석 무선충전+자세 메모리+프라이버시 글라스", "B&O 프리미어 3D 23스피커+버추얼 베뉴", "블랙 애쉬 우드 G90 전용 패턴 내장재"];
          
          const G90_LWB_BLACK_F = ["+G90 Black 전용 디자인", "+G90 LWB Black 전용 디자인(프론트 범퍼 인테이크 그릴/리어 범퍼 하단부)", "가솔린 3.5 T-GDI + 48V e-슈퍼차저 (기본)", "AWD (기본)", "멀티 챔버 에어 서스펜션", "후륜 조향 시스템", "245/45R20+275/40R20 미쉐린+20\" 다크 스퍼터링 휠 (Black 전용)", "지능형 헤드램프", "어드밴스드 3존+ 공조", "이지 클로즈 시스템", "Black 전용 세미 애닐린 가죽(퀼팅)", "운전석 에르고 릴렉싱(22way 마사지)+동승석 12way+뒷좌석 에르고 릴렉싱(16way 마사지)", "뒷좌석 레그레스트(4way)+VIP 풋레스트", "뒷좌석 통풍/윙아웃/목베개/무선충전/자세 메모리/프라이버시 글라스", "B&O 프리미어 3D 23스피커+버추얼 베뉴"];
          
          return {
            model_id: "g90",
            model_name: "G90",
            category: "플래그십 럭셔리 세단",
            year: 2026,
            variants: [
              {
                variant_id: "g90_standard",
                variant_name: "G90 가솔린 3.5 터보",
                vehicle_type: "플래그십 세단",
                fuel: "가솔린",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "standard", name: "스탠다드 (5인승, 2WD 기본)", seats: 5,
                    base_price_5: 9760, base_price_3_5: 9617,
                    engine: "스마트스트림 G 3.5 T-GDI (380hp) / 48V e-S/C (415hp) 옵션",
                    fuel_economy: { combined: 9.3, urban: 8.0, highway: 11.5, co2: 184 },
                    standard_features: G90_STANDARD_F,
                    available_options: ["engine_esc", "awd", "vip_4seat", "signature_design", "popular_collection", "premium_collection", "prestige_collection", "front_comfort", "rear_comfort_1", "rear_comfort_2", "bno_sound", "multi_air_susp", "rear_steering", "easy_close", "panoramic_sunroof", "builtin_cam", "rear_entertainment"] }
                ],
                options_master: G90_OPTIONS,
                exclusive_groups: [
                  { id: "rear_comfort", label: "뒷좌석 컴포트", members: ["rear_comfort_1", "rear_comfort_2"] },
                  { id: "collections", label: "컬렉션 패키지", members: ["popular_collection", "premium_collection", "prestige_collection"] }
                ],
                option_excludes: {
                  "rear_comfort_2": ["rear_comfort_1"],
                  "popular_collection": ["front_comfort", "rear_comfort_1"],
                  "premium_collection": ["front_comfort", "rear_comfort_1", "signature_design", "easy_close", "multi_air_susp", "rear_steering"],
                  "prestige_collection": ["front_comfort", "rear_comfort_1", "rear_comfort_2", "signature_design", "easy_close", "multi_air_susp", "rear_steering", "rear_entertainment"]
                }
              },
              {
                variant_id: "g90_lwb",
                variant_name: "G90 Long Wheel Base",
                vehicle_type: "플래그십 세단 (LWB, 쇼퍼 드리븐, AWD/e-S/C 기본)",
                fuel: "가솔린(48V MHEV)",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "lwb", name: "Long Wheel Base (5인승 기본)", seats: 5,
                    base_price_5: 16790, base_price_3_5: 16647,
                    engine: "G 3.5 T-GDI + 48V e-S/C (415hp/56kgf·m)",
                    fuel_economy: { combined: 8.2, urban: 7.1, highway: 10.1, co2: 207 },
                    standard_features: [...G90_STANDARD_F, ...G90_LWB_F],
                    available_options: ["vip_4seat", "signature_metal", "rear_comfort_lwb", "builtin_cam", "panoramic_sunroof_lwb", "rear_entertainment"] }
                ],
                options_master: G90_LWB_OPTIONS
              },
              {
                variant_id: "g90_black",
                variant_name: "G90 Black",
                vehicle_type: "플래그십 세단 (Black 에디션, AWD 기본)",
                fuel: "가솔린",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "black", operating: false, name: "Black (5인승 기본)", seats: 5,
                    base_price_5: 12960, base_price_3_5: 12817,
                    engine: "G 3.5 T-GDI (380hp) / 48V e-S/C (415hp) 옵션",
                    fuel_economy: { combined: 8.0, urban: 7.0, highway: 9.8, co2: 213 },
                    standard_features: [...G90_STANDARD_F, ...G90_BLACK_F],
                    available_options: ["engine_esc_black", "vip_4seat_black", "panoramic_sunroof", "builtin_cam", "rear_entertainment"] }
                ],
                options_master: G90_BLACK_OPTIONS
              },
              {
                variant_id: "g90_lwb_black",
                variant_name: "G90 Long Wheel Base Black",
                vehicle_type: "플래그십 세단 (LWB Black 에디션, e-S/C+AWD 기본)",
                fuel: "가솔린(48V MHEV)",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "lwb_black", operating: false, name: "LWB Black (5인승 기본)", seats: 5,
                    base_price_5: 17520, base_price_3_5: 17377,
                    engine: "G 3.5 T-GDI + 48V e-S/C (415hp)",
                    fuel_economy: { combined: 8.2, urban: 7.1, highway: 10.1, co2: 207 },
                    standard_features: [...G90_STANDARD_F, ...G90_LWB_F, ...G90_LWB_BLACK_F],
                    available_options: ["vip_4seat_black", "panoramic_sunroof_lwb", "builtin_cam", "rear_entertainment"] }
                ],
                options_master: G90_LWB_BLACK_OPTIONS
              }
            ],
            exterior_colors: [
              { name: "우유니 화이트", code: "UYH", hex: "#f7f4ec", price: 0 },
              { name: "세빌 실버", code: "SSS", hex: "#9d9e9f", price: 0 },
              { name: "마칼루 그레이 (글로시)", code: "NCM", hex: "#5b5e60", price: 0 },
              { name: "비크 블랙", code: "PH3", hex: "#1a1a1d", price: 0 },
              { name: "마우이 블랙", code: "HBK", hex: "#0d0d10", price: 0 },
              { name: "카프리 블루", code: "NRB", hex: "#0e3a5a", price: 0 },
              { name: "태즈먼 블루", code: "URA", hex: "#1d3550", price: 0 },
              { name: "마칼루 그레이 매트(무광)", code: "MPE", hex: "#4f5253", price: 80 }
            ]
          };
        })(),
        
        // ========== GV70 ==========
        (() => {
          const GV70_OPTIONS = {
            awd: { name: "AWD", sub: "전자제어 풀타임 4WD", price: 280 },
            popular_1: { name: "파퓰러 패키지 Ⅰ", sub: "HUD + 드라이빙 어시스턴스 패키지 Ⅰ", price: 250 },
            popular_2: { name: "파퓰러 패키지 Ⅱ", sub: "파퓰러 Ⅰ + 2열 컴포트 + 빌트인 캠", price: 480 },
            convenience: { name: "컨비니언스 패키지", sub: "에르고모션 시트(운/동승) + 빌트인 공기청정기", price: 270 },
            driving_assist_1: { name: "드라이빙 어시스턴스 패키지 Ⅰ", sub: "SVM + 후측방 모니터 + RSPA 2 + 주차 충돌방지", price: 165 },
            driving_assist_2: { name: "드라이빙 어시스턴스 패키지 Ⅱ", sub: "FCA2 + HDA2 + 지능형 헤드램프", price: 200 },
            rear_comfort: { name: "2열 컴포트 패키지", sub: "뒷좌석 도어커튼 + 3존 공조 + 뒷좌석 통풍 + 러기지 매트", price: 220 },
            bnO_18: { name: "뱅앤올룹슨 18-스피커 사운드", price: 230 },
            builtin_cam: { name: "빌트인 캠 패키지", sub: "+ 보조배터리 + AR 내비", price: 95 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 124 },
            sport_pkg: { name: "스포츠 패키지 (2.5T 19\" 휠용)", sub: "스포츠 외관/내장 + 19\"휠 + 4P 브레이크", price: 350 },
            wheel_21_silent: { name: "21\" 중공 흡음 휠", price: 250 },
            e_lsd: { name: "e-LSD (전자식 차동제한)", sub: "2.5T 19\"휠 스포츠 패키지에서 선택 가능 (2026 옵션 분리)", price: 70 },
            signature_design: { name: "시그니처 디자인 셀렉션", sub: "프라임 나파 가죽 + 엘레강스 무드 + 투톤 가죽 스티어링", price: 380 },
            sport_design_2: { name: "스포츠 디자인 셀렉션 Ⅱ", sub: "옵시디언 블랙/바닐라 베이지 투톤 + 그레이 스티치 (2026 신규)", price: 350 }
          };
          
          // 배타 그룹 (한 그룹에서 동시 하나만 선택)
          const GV70_EXCLUSIVE = [
            { id: "popular_pkg", label: "파퓰러 패키지", members: ["popular_1", "popular_2"] },
            { id: "driving_assist", label: "드라이빙 어시스턴스", members: ["driving_assist_1", "driving_assist_2"] },
            { id: "design_selection", label: "디자인 셀렉션", members: ["signature_design", "sport_design_2"] }
          ];
          // 포함 관계
          const GV70_EXCLUDES = {
            "popular_1": ["driving_assist_1"],  // 파퓰러 I = HUD + 드라이빙 어시스턴스 I
            "popular_2": ["popular_1", "driving_assist_1", "rear_comfort", "builtin_cam"]  // 파퓰러 II = 파퓰러 I + 2열 컴포트 + 빌트인 캠
          };
          
          const GV70_STANDARD_F = ["스마트스트림 G 2.5 T-GDI (304hp) / 3.5 T-GDI (380hp, AWD 기본)", "8단 자동변속기", "ISG", "통합 주행모드", "MFR LED 헤드램프", "Full LED 리어콤비", "14.5\" 증강현실 내비게이션", "Genesis Connected Services 5년 무료", "OTA + 인카페이먼트", "10에어백", "FCA(차량/보행자)", "HDA + SCC + NSCC", "LKA/LFA/HBA/DAW", "BCA/RCCA/SEW", "어드밴스드 후석승객알림", "★ 2026 NVH 강화: 언더커버 흡음재 + 엔진 서포트 댐퍼(2.5T)", "★ 2026 천연가죽 시트 적용범위 확대 (스탠다드)", "운전석 8way 전동 시트", "1열 열선/통풍", "전자식 변속레버", "패들쉬프트", "EPB", "터치타입 공조 패널", "디지털키 2", "앰비언트 라이트", "18\" 알로이 휠 (기본) / 19\"·21\" 선택", "후면 GENESIS 단독 레터링 (2026)"];
          
          return {
            model_id: "gv70",
            model_name: "GV70",
            category: "프리미엄 중형 SUV (2026.10.20 연식변경)",
            year: 2026,
            variants: [
              {
                variant_id: "gasoline_2_5t",
                variant_name: "GV70 가솔린 2.5 터보",
                vehicle_type: "프리미엄 SUV",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "standard", name: "스탠다드 (2WD 기본)", seats: 5, base_price_5: 5400, base_price_3_5: 5318, engine: "스마트스트림 G 2.5 T-GDI (304hp/43kgf·m)",
                    fuel_economy: { combined: 10.2, urban: 8.9, highway: 12.5, co2: 164 },
                    standard_features: GV70_STANDARD_F,
                    available_options: ["awd", "popular_1", "popular_2", "convenience", "driving_assist_1", "driving_assist_2", "rear_comfort", "bnO_18", "builtin_cam", "panoramic_sunroof", "sport_pkg", "wheel_21_silent", "e_lsd", "signature_design", "sport_design_2"] }
                ],
                options_master: GV70_OPTIONS,
                exclusive_groups: GV70_EXCLUSIVE,
                option_excludes: GV70_EXCLUDES
              },
              {
                variant_id: "gasoline_3_5t",
                variant_name: "GV70 가솔린 3.5 터보 (AWD 기본)",
                vehicle_type: "프리미엄 SUV (고성능)",
                fuel: "가솔린",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "standard", name: "스탠다드 (AWD 기본)", seats: 5, base_price_5: 5950, base_price_3_5: 5868, engine: "스마트스트림 G 3.5 T-GDI (380hp/53kgf·m)",
                    fuel_economy: { combined: 8.9, urban: 7.8, highway: 10.9, co2: 189 },
                    standard_features: [...GV70_STANDARD_F, "AWD 기본", "프리뷰 전자제어 서스펜션", "19인치 미쉐린 타이어", "전륜 코퍼도장 모노블럭(4P) 브레이크", "후륜 스타일링 커버"],
                    available_options: ["popular_1", "popular_2", "convenience", "driving_assist_1", "driving_assist_2", "rear_comfort", "bnO_18", "builtin_cam", "panoramic_sunroof", "wheel_21_silent", "signature_design", "sport_design_2"],
                    trim_prices: { sport_pkg: 335 } }
                ],
                options_master: GV70_OPTIONS,
                exclusive_groups: GV70_EXCLUSIVE,
                option_excludes: GV70_EXCLUDES
              }
            ],
            exterior_colors: [
              { name: "우유닉 화이트", code: "UW", hex: "#f5f4ee", price: 0 },
              { name: "베링 블루 (2026 신규)", code: "BRB", hex: "#1a4a6a", price: 0 },
              { name: "마칼루 그레이 매트(무광)", code: "MGM", hex: "#6a6a6a", price: 70 },
              { name: "비크 블랙", code: "BB", hex: "#1a1a1a", price: 0 },
              { name: "한라산 그레이", code: "HG", hex: "#5a5a5a", price: 0 },
              { name: "벌리 블루", code: "BLB", hex: "#1f3d5f", price: 0 },
              { name: "카프리 블루", code: "CB", hex: "#0e5572", price: 0 },
              { name: "헤멜 그레이", code: "HMG", hex: "#7a7a78", price: 0 }
            ]
          };
        })(),
        
        // ========== GV80 ==========
        (() => {
          const GV80_OPTIONS = {
            awd: { name: "AWD", sub: "전자제어 풀타임 4WD", price: 300 },
            popular: { name: "파퓰러 패키지", sub: "HUD + 드라이빙 어시스턴스 Ⅰ + Ⅱ + 빌트인 캠 (2026 묶음)", price: 550 },
            convenience: { name: "컨비니언스 패키지", sub: "에르고모션 시트(운/동승) + 빌트인 공기청정기", price: 300 },
            driving_assist_1: { name: "드라이빙 어시스턴스 Ⅰ", sub: "SVM + 후측방 모니터 + RSPA 2", price: 195 },
            driving_assist_2: { name: "드라이빙 어시스턴스 Ⅱ", sub: "FCA2 + HDA2 + 지능형 헤드램프", price: 200 },
            rear_comfort: { name: "2열 컴포트 패키지", sub: "뒷좌석 도어커튼 + 3존 공조 + 통풍 + 220V", price: 270 },
            seat_6: { name: "6인승 (2+2+2 캡틴체어)", price: 280 },
            seat_7: { name: "7인승 (2열 캡틴체어)", price: 200 },
            bnO_22: { name: "뱅앤올룹슨 22-스피커 사운드", price: 280 },
            builtin_cam: { name: "빌트인 캠 패키지", sub: "+ 보조배터리 + AR 내비 (Black은 기본)", price: 95 },
            panoramic_sunroof: { name: "파노라마 선루프", price: 138 },
            power_sidestep: { name: "전동식 사이드 스텝", sub: "Black 전용 (2026 신규)", price: 220 },
            wheel_21: { name: "21\" 휠 + 미쉐린 타이어", price: 200 },
            trailer_hitch: { name: "트레일러 히치", price: 80 }
          };
          
          // 배타 그룹
          const GV80_EXCLUSIVE = [
            { id: "seats", label: "좌석 구성", members: ["seat_6", "seat_7"] },
            { id: "driving_assist", label: "드라이빙 어시스턴스", members: ["driving_assist_1", "driving_assist_2"] }
          ];
          // 포함 관계
          const GV80_EXCLUDES = {
            "popular": ["driving_assist_1", "driving_assist_2", "builtin_cam"]  // 파퓰러 = HUD+드라이빙어시스턴스 I+II+빌트인캠
          };
          
          const GV80_STANDARD_F = ["스마트스트림 G 2.5 T-GDI (304hp) / 3.5 T-GDI (380hp)", "8단 자동변속기", "전자제어 서스펜션", "통합 주행모드", "MFR LED 헤드램프", "Full LED 리어콤비", "14.5\" 증강현실 내비게이션", "Genesis Connected Services 5년 무료", "10에어백", "FCA(차량/보행자)", "HDA + SCC + NSCC", "LKA/LFA/HBA/DAW", "BCA/RCCA/SEW", "어드밴스드 후석승객알림", "프라임 나파 가죽 시트", "운/동승 8way 전동", "1열 열선/통풍", "전자식 변속레버", "디지털키 2", "★ 후면 GENESIS 단독 레터링 (2026 신규)", "★ 50만원 인하 (2026)"];
          const GV80_BLACK_F = ["+Black 전용 블랙 디테일(그릴/엠블럼/몰딩)", "전용 블랙 휠", "B&O 22-스피커 (기본)", "★ 빌트인 캠 패키지 (Black 2026 기본화)", "전동식 사이드 스텝 옵션 가능"];
          
          return {
            model_id: "gv80",
            model_name: "GV80",
            category: "프리미엄 대형 SUV (2025.9.10 연식변경)",
            year: 2026,
            variants: [
              {
                variant_id: "gasoline_2_5t",
                variant_name: "GV80 가솔린 2.5 터보",
                vehicle_type: "프리미엄 대형 SUV",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "standard", name: "스탠다드 (2WD 기본)", seats: 5, base_price_5: 6895, base_price_3_5: 6790, engine: "스마트스트림 G 2.5 T-GDI (304hp/43kgf·m)",
                    fuel_economy: { combined: 9.3, urban: 8.2, highway: 11.0, co2: 183 },
                    standard_features: GV80_STANDARD_F,
                    available_options: ["awd", "popular", "convenience", "driving_assist_1", "driving_assist_2", "rear_comfort", "seat_6", "seat_7", "bnO_22", "builtin_cam", "panoramic_sunroof", "wheel_21", "trailer_hitch"] }
                ],
                options_master: GV80_OPTIONS,
                exclusive_groups: GV80_EXCLUSIVE,
                option_excludes: GV80_EXCLUDES
              },
              {
                variant_id: "gasoline_3_5t",
                variant_name: "GV80 가솔린 3.5 터보",
                vehicle_type: "프리미엄 대형 SUV (고성능)",
                fuel: "가솔린",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "standard", name: "스탠다드 (2WD 기본)", seats: 5, base_price_5: 7445, base_price_3_5: 7340, engine: "스마트스트림 G 3.5 T-GDI (380hp/54kgf·m)",
                    fuel_economy: { combined: 8.6, urban: 7.7, highway: 10.0, co2: 199 },
                    standard_features: [...GV80_STANDARD_F, "20인치 미쉐린 타이어 & 다이아몬드 컷팅 휠", "전륜 코퍼도장 모노블럭(4P) 브레이크", "후륜 스타일링 커버"],
                    available_options: ["awd", "popular", "convenience", "driving_assist_1", "driving_assist_2", "rear_comfort", "seat_6", "seat_7", "bnO_22", "builtin_cam", "panoramic_sunroof", "wheel_21", "trailer_hitch"] }
                ],
                options_master: GV80_OPTIONS,
                exclusive_groups: GV80_EXCLUSIVE,
                option_excludes: GV80_EXCLUDES
              },
              {
                variant_id: "black_2_5t",
                variant_name: "GV80 Black 2.5T",
                vehicle_type: "프리미엄 대형 SUV (Black 에디션)",
                fuel: "가솔린",
                displacement_cc: 2497,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "black", name: "Black", seats: 5, base_price_5: 9520, base_price_3_5: 9377, engine: "스마트스트림 G 2.5 T-GDI (304hp)",
                    fuel_economy: { combined: 8.3, urban: 7.4, highway: 9.7, co2: 206 },
                    standard_features: [...GV80_STANDARD_F, ...GV80_BLACK_F],
                    available_options: ["power_sidestep", "panoramic_sunroof", "rear_comfort", "seat_6", "seat_7", "wheel_21"] }
                ],
                options_master: GV80_OPTIONS,
                exclusive_groups: GV80_EXCLUSIVE,
                option_excludes: GV80_EXCLUDES
              },
              {
                variant_id: "black_3_5t",
                variant_name: "GV80 Black 3.5T",
                vehicle_type: "프리미엄 대형 SUV (Black, 고성능)",
                fuel: "가솔린",
                displacement_cc: 3470,
                transmission: "8단 자동",
                trims: [
                  { trim_id: "black", operating: false, name: "Black", seats: 5, base_price_5: 9940, base_price_3_5: 9797, engine: "스마트스트림 G 3.5 T-GDI (380hp)",
                    fuel_economy: { combined: 7.7, urban: 6.8, highway: 9.2, co2: 223 },
                    standard_features: [...GV80_STANDARD_F, ...GV80_BLACK_F],
                    available_options: ["power_sidestep", "panoramic_sunroof", "rear_comfort", "seat_6", "seat_7", "wheel_21"] }
                ],
                options_master: GV80_OPTIONS,
                exclusive_groups: GV80_EXCLUSIVE,
                option_excludes: GV80_EXCLUDES
              }
            ],
            exterior_colors: [
              { name: "우유닉 화이트", code: "UW", hex: "#f5f4ee", price: 0 },
              { name: "마칼루 그레이 매트(무광)", code: "MGM", hex: "#6a6a6a", price: 80 },
              { name: "비크 블랙", code: "BB", hex: "#1a1a1a", price: 0 },
              { name: "한라산 그레이", code: "HG", hex: "#5a5a5a", price: 0 },
              { name: "벌리 블루", code: "BLB", hex: "#1f3d5f", price: 0 },
              { name: "카프리 블루", code: "CB", hex: "#0e5572", price: 0 },
              { name: "옵시디언 블랙 (Black 전용)", code: "OB", hex: "#0a0a0a", price: 0 },
              { name: "헤멜 시닉", code: "HC", hex: "#3d3833", price: 0 }
            ]
          };
        })()
      ]
    }
  ]
};
