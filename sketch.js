// ==========================================
// 1. 게임 설정 (CONFIGURATION)
// 게임의 난이도나 물리 법칙을 여기서 한꺼번에 조절합니다.
// ==========================================

const CONFIG = {
    gameW: 520,         // 게임 화면의 가로 너비 
    waterRatio: 0.83,   // 화면 아래쪽 물이 차오르는 높이 비율

    // [물리 엔진 설정]
    gravity: 0.9,       // 중력: 매 프레임마다 아래로 당기는 힘 (클수록 빨리 떨어짐)
    jumpPower: -20,     // 점프력: 위로 솟구치는 힘 (음수여야 화면 위쪽인 Y=0 방향으로 감)
    moveSpeed: 4,       // 맵 이동 속도: 배경이 왼쪽으로 흐르는 속도

    // [발판(플랫폼) 생성 규칙]
    platform: {
        minYRatio: 0.4, // 발판이 생성될 수 있는 가장 높은 위치 (화면 상단 40%)
        maxYRatio: 0.7, // 발판이 생성될 수 있는 가장 낮은 위치 (화면 하단 70%)
        maxDeltaY: 70,  // 다음 발판이 이전 발판보다 얼마나 높거나 낮을 수 있는지 (난이도 조절)    
        wNormal: { min: 220, max: 270 }, // 일반 발판 너비 범위
        wThin: { min: 150, max: 160 },     // 좁은 발판 너비 범위
        thinProb: 0.3   // 좁은 발판이 나올 확률 (0.3 = 30%)    
    },

    // [장애물 설정]
    obstacle: {
      spikeSize: 35,       // 바닥 압정 크기
      sawSize: 50,         // 공중 톱니 크기
      sawHeight: 65,       // 톱니가 발판 위에서 얼마나 위로 뜨는지(픽셀)

      // 이 길이 이상일 때만 장애물 생성
      minPlatformWidthForObstacle: 250   // 숫자 바꿔가며 조절 가능
    },
 
    // [얼굴 인식 민감도 설정]
    thresholds: {
        roll: 0.15,     // 고개 갸웃거림(Roll) 허용 범위
        yaw: 0.25,      // 얼굴 좌우 회전(Yaw) 허용 범위
        pitchMin: 0.4,  // 고개 들기(Pitch) 최소 비율
        pitchMax: 1.8   // 고개 숙이기(Pitch) 최대 비율
    }
};

// 얼굴 인식에 필요한 옵션들
const DETECTION_OPTIONS = {
    withLandmarks: true,
    withDescriptors: true,
    withExpressions: true
};

// ==========================================
// 2. 전역 변수 (GLOBAL VARIABLES)
// ==========================================

let canvas, cam, faceapi; // 캔버스, 웹캠, 얼굴인식 도구

// 폰트
let titleFont;
let bodyFont;

// 이미지 파일들을 담아둘 객체
let assets = {
    introBg: null, logo: null, idle: null, jump: null, waves: [], titleFont: null, bodyFont: null
};

let isModelReady = false;   // AI 모델이 로딩 다 됐는지 확인하는 깃발

// 버튼 정보 (위치/크기 저장용)
let startBtn     = { x: 0, y: 0, w: 0, h: 0 };
let ruleNextBtn  = { x: 0, y: 0, w: 0, h: 0 };
let faceBtn      = { x: 0, y: 0, w: 0, h: 0 };
let voiceBtn     = { x: 0, y: 0, w: 0, h: 0 };

// 게임 상태 관리
let gameState = 'intro';
let selectedMode = null;    // 'face' 또는 'voice' 모드 저장

// 점수 관련
let startTime = 0;  // 게임 시작 시각 (밀리초)
let score = 0;      // 현재 점수 (생존 시간)
let bestScore = 0;  // 최고 점수

// 맵 스크롤링 관련 변수
let worldOffset = 0;    // 플레이어가 얼마나 앞으로 갔는지 누적 거리
let worldSpeed = 0;     // 현재 맵이 움직이는 속도
let waterLevel = 0;     // 물의 Y좌표 높이
let waveAnimOffset = 0; // 파도 물결 애니메이션을 위한 변수

let player;       // 플레이어 캐릭터 객체
let platforms = []; // 화면에 보이는 발판들의 리스트
let obstacles = []; // 장애물 리스트

// 얼굴 인식 결과 저장용
let detections = [];
let currentExpression = 'neutral'; // 현재 표정 (happy, neutral 등)
let faceAngleWarning = false;      // 자세가 나쁜지 체크
let warningMessage = "";           // 경고 메시지 내용

// 음성 인식 관련 변수 (Voice 모드)
let audioContext;
let mic;
let pitch;
let audioStarted = false;
let voiceModelLoaded = false;
let currentPitch = 0;
let currentNote = "";
let baselinePitch = 0; // 기준 음정
let pitchHistory = [];
let calibrating = false;
let calibrationTime = 0;
let smoothedPitch = 0; // 스무딩된 피치 값
let pitchSmoothFactor = 0.4; // 스무딩 정도 (0-1, 높을수록 빠른 반응)
let lastValidPitch = 0; // 마지막 유효한 피치
let volumeThreshold = 0.015; // 볼륨 임계값 (낮추면 더 민감)
let calibrationMessage = "편안한 음정으로 소리를 내주세요"; // 캘리브레이션 메시지
let voiceLoadStartTime = 0; // Voice 모드 로딩 시작 시간
let calibrationStartTime = 0; // 캘리브레이션 시작 시간
let calibrationFailCount = 0; // 캘리브레이션 실패 횟수

// ==========================================
// 3. 초기화 (SETUP)
// ==========================================

// 이미지 로드
function preload() {
  assets.introBg = loadImage("images/intro_bg.png");
  assets.ruleBg = loadImage("images/rule_bg.png")
  assets.logo = loadImage("images/logo.png");

  assets.startBtn = loadImage("images/btn_start.png");
  assets.faceBtn = loadImage("images/btn_face.png");
  assets.voiceBtn = loadImage("images/btn_voice.png");

  assets.idle = loadImage("images/슝슝이.png");
  assets.jump = loadImage("images/슝슝이J.png");
  assets.down = loadImage("images/슝슝이D.png")
  assets.waves[0] = loadImage("images/wave1.png");
  assets.waves[1] = loadImage("images/wave2.png");
  assets.waves[2] = loadImage("images/wave3.png");
  assets.waves[3] = loadImage("images/wave4.png");

  assets.titleFont = loadFont("fonts/CookieRun_Bold.ttf");
  assets.bodyFont = loadFont("fonts/CookieRun_Regular.ttf");
}

function setup() {
  canvas = createCanvas(CONFIG.gameW, windowHeight);
  centerCanvas();
  waterLevel = height * CONFIG.waterRatio;

  // 웹캠 설정 (비율은 원본 그대로, 나중에 그릴 때 크롭)
  cam = createCapture(VIDEO);
  cam.hide();
  cam.elt.setAttribute("playsinline", ""); // 아이폰 등 모바일 호환성

  // 플레이어 캐릭터 생성
  player = new Player();

  updateUIPositions();  // 버튼 위치
}

function windowResized() {
  resizeCanvas(CONFIG.gameW, windowHeight);
  centerCanvas();
  waterLevel = height * CONFIG.waterRatio;
  updateUIPositions();
}

// 버튼들의 위치 한 번에 세팅
function updateUIPositions() {
  // 1) 인트로 화면 - START 버튼 (가운데 아래쪽)
  startBtn.w = 200;
  startBtn.h = 70;
  startBtn.x = width / 2 - startBtn.w / 2;
  startBtn.y = height / 2 - 110;

  // 2) 모드 선택 화면 - Face / Voice 버튼
  faceBtn.w = 330;
  faceBtn.h = 75;
  faceBtn.x = width / 2 - faceBtn.w / 2;
  faceBtn.y = height / 2 - 60;

  voiceBtn.w = 330;
  voiceBtn.h = 75;
  voiceBtn.x = width / 2 - voiceBtn.w / 2;
  voiceBtn.y = height / 2 + 60;
}

// 마우스가 버튼 위에 있는지 확인
function isInside(btn) {
  return (
    mouseX > btn.x &&
    mouseX < btn.x + btn.w &&
    mouseY > btn.y &&
    mouseY < btn.y + btn.h
  );
}

// 이미지 버튼 그리기 (살짝 커지는 효과)
function drawImageButton(btn, img) {
  if (!img) return;

  let hover = isInside(btn);
  let scaleFactor = hover ? 1.05 : 1.0;  // hover 시 5% 확대

  push();
  translate(btn.x + btn.w / 2, btn.y + btn.h / 2);
  scale(scaleFactor);
  imageMode(CENTER);
  image(img, 0, 0, btn.w, btn.h);
  pop();
}

// 캔버스를 브라우저 화면 정중앙에 위치시키는 계산
function centerCanvas() {
  canvas.position((windowWidth - width) / 2, 0);
}

// ==========================================
// 4. 메인 루프 (DRAW)
// ==========================================

function draw() {
  // 1) 웹캠 배경
  if (gameState === 'playing' || gameState === 'gameover') {
    // 게임 중 & 게임 오버일 때만 웹캠 배경 사용
    drawWebcamBackground();
  } else {
    background(60);
  }
  // 2) 현재 게임 상태(gameState)에 따라 다른 화면을 보여주기
    if (gameState === 'intro') {
  drawIntroScreen();
  } 
  else if (gameState === 'rule') {
    drawRuleScreen();
  } 
  else if (gameState === 'modeSelect') {
    drawModeSelectScreen();
  } 
  else if (gameState === 'loading') {
    drawLoadingScreen();
  } 
  else if (gameState === 'playing') {
    runGame();
  } 
  else if (gameState === 'gameover') {
    drawWorld(false);
    drawPlayer();
    drawGameOverScreen();
  }

  // 얼굴 모드일 때 각도가 틀어지면 경고창 띄우기
  if (selectedMode === 'face' && faceAngleWarning && gameState === 'playing') {
    drawWarningOverlay();
  }

  // Voice 모드일 때 캘리브레이션 중이면 오버레이 띄우기
  if (selectedMode === 'voice' && calibrating && gameState === 'playing') {
    drawCalibrationOverlay();
  }
}

// ==========================================
// 5. 게임 로직 (GAME LOGIC)
// ==========================================

function runGame() {
  // Voice 모드이고 캘리브레이션 중이면 게임 로직 일시 중지
  if (selectedMode === 'voice' && calibrating) {
    drawWorld(true);           // 배경만 그리기
    drawPlayer();              // 플레이어만 그리기
    return;
  }

  // 점수 계산(초)
  score = floor((millis() - startTime) / 1000);

  // 맵을 계속 왼쪽으로 이동시킴
  worldSpeed = CONFIG.moveSpeed;
  worldOffset += worldSpeed;

  updateInfinitePlatforms(); // 발판 계속 만들기/삭제하기
  drawWorld(true);           // 배경(파도, 발판) 그리기

  handlePlayerInput();              // 점프 입력 확인
  player.update();                  // 플레이어 물리 이동 (중력 적용)
  player.checkCollision(platforms); // 발판에 닿았는지 확인
  player.checkFall();               // 물에 빠졌는지 확인
  player.checkObstacleCollision(obstacles); // 장애물과 부딪혔는지 확인
  
  drawPlayer(); // 플레이어 그리기
  drawScore();  // 점수 표시
}

// 게임을 새로 시작할 때 변수들을 초기화(리셋)하는 함수
function initGame() {
  worldOffset = 0;
  worldSpeed = 0;
  score = 0;
  faceAngleWarning = false;
  currentExpression = 'neutral';
  
  // Voice 모드 변수 초기화
  if (selectedMode === 'voice') {
    // 캘리브레이션은 startVoiceCalibration에서 처리
    // 여기서는 게임 관련 변수만 초기화
  }
  
  player.reset(); // 플레이어 위치 초기화
  
  platforms = []; // 기존 발판 싹 비우기
  obstacles = [];   // 장애물 초기화

  // 첫 번째 안전 발판 생성
  platforms.push({ x: 0, y: height/2 + 50, w: 400, h: 40 });
  
  // 초기 발판 3개 미리 생성
  let currentX = 400 + 100; 
  let prevY = height / 2;
  for (let i = 0; i < 3; i++) {
      addRandomPlatform(currentX, prevY);
      let last = platforms[platforms.length - 1];
      // 다음 발판은 현재 발판 끝에서 100~180px 떨어진 곳에 배치
      currentX = last.x + last.w + random(100, 180);
      prevY = last.y;
  }

  alignPlayerToStart(); // 플레이어를 첫 발판 위에 올리기
}

// 무작위 위치에 발판 하나를 추가하는 함수
function addRandomPlatform(startX, prevY) {
  const minY = height * CONFIG.platform.minYRatio;
  const maxY = height * CONFIG.platform.maxYRatio;

  // 30% 확률로 좁은 발판(어려운 발판) 생성
  let isThin = random() < CONFIG.platform.thinProb;
  let w = isThin ? random(CONFIG.platform.wThin.min, CONFIG.platform.wThin.max) 
                  : random(CONFIG.platform.wNormal.min, CONFIG.platform.wNormal.max);
  
  // 높이(Y) 계산: 이전 발판 높이(prevY)에서 너무 차이나지 않게(maxDeltaY) 조절
  let targetY = random(minY, maxY);
  let y = constrain(targetY, prevY - CONFIG.platform.maxDeltaY, prevY + CONFIG.platform.maxDeltaY);
  // 화면 밖으로 나가지 않게 한 번 더 잡아줌
  y = constrain(y, minY, maxY);

  const p = { x: startX, y: y, w: w, h: 40 }; 
  platforms.push(p);  // 발판
  addObstacleForPlatform(p);  // 장애물 
}

// 특정 발판 p 위/근처에 장애물을 확률적으로 생성
function addObstacleForPlatform(p) {
  // 너비가 250 이상인 발판에만 장애물 생성
  if (p.w < CONFIG.obstacle.minPlatformWidthForObstacle) return;

  // 0.0 ~ 1.0 사이 랜덤값
  const r = random();

  // 20% 확률로 장애물 미생성
  if (r < 0.2) return;

  // 35% 정도는 spike, 35% 정도는 saw
  if (r < 0.65) {
    // spike (발판 윗면 + 발판 너비 안에서만 배치)
    const spikeW = CONFIG.obstacle.spikeSize;
    const minX = p.x + p.w * 0.4;
    const maxX = p.x + p.w * 0.6 - spikeW;  
    const spikeX = random(minX, maxX);
    const spikeY = p.y - p.h; // 발판 윗면

    obstacles.push(new Obstacle('spike', spikeX, spikeY));

  } else {
    // saw (발판 위 공중에 뜨는 톱니)
    const sawW = CONFIG.obstacle.sawSize;

    // 발판 중앙 근처에 생성 (40~60%)
    const sawX = p.x + p.w * random(0.4, 0.6);
    const sawY = (p.y - p.h) - CONFIG.obstacle.sawHeight;

    obstacles.push(new Obstacle('saw', sawX - sawW/2, sawY));
    // Obstacle는 x를 왼쪽 기준으로 받으니까 살짝 왼쪽으로 보정
  }
}


function alignPlayerToStart() {
  if (platforms.length === 0) return;
  const first = platforms[0];
  // 플레이어 발 끝이 발판 위에 딱 맞게 Y좌표 설정
  player.y = first.y - first.h - player.size/2;
  player.onGround = true;
}

// 플레이어의 점프 입력을 처리
function handlePlayerInput() {
  if (selectedMode === 'face') {
    // 얼굴 모드: 땅에 있을 때만 점프 가능
    if (player.onGround) {
      // 행복하거나 놀란 표정이면 점프!
      if (currentExpression === 'happy' || currentExpression === 'surprised') {
        player.jump();
      }
    }
  } 
  else if (selectedMode === 'voice') {
    // 음성 모드: 피치 기반 제어
    controlPlayerWithPitch();
  }

  // 키보드 테스트용 (위 화살표나 스페이스바)
  if (keyIsDown(UP_ARROW) || keyIsDown(32)) { 
    if (player.onGround) {
      player.jump();
    }
  }
}

// Voice 모드: 피치 기반 플레이어 제어
function controlPlayerWithPitch() {
  // 캘리브레이션 중이면 제어하지 않음
  if (calibrating || !baselinePitch || baselinePitch === 0) {
    return;
  }

  if (currentPitch > 0 && baselinePitch > 0) {
    // 피치 스무딩 적용
    smoothedPitch = smoothedPitch * (1 - pitchSmoothFactor) + currentPitch * pitchSmoothFactor;

    // Hz 차이 대신 Cents(상대 음정) 차이를 계산
    let centsDiff = frequencyToCents(baselinePitch, smoothedPitch);

    // 기준 음정 근처 (-150 Cents ~ +200 Cents) -> 숙이기
    if (centsDiff >= -150 && centsDiff < 200) {
      if (player.onGround) {
        player.crouchOn();
      }
    } else {
      player.crouchOff();
    }

    // 높은 음 (200 Cents 이상) -> 점프 (지면에 있을 때만)
    if (centsDiff >= 200 && player.onGround) {
      // Cents 차이에 따라 점프력 조절
      let jumpPower = map(centsDiff, 200, 700, 15, 25);
      jumpPower = constrain(jumpPower, 15, 25);
      
      // Player 클래스의 jump 메서드가 점프력을 받을 수 있도록 수정 필요
      // 일단 기본 점프 사용
      player.jump();
    }
  } else {
    // 소리를 내지 않을 때
    smoothedPitch = smoothedPitch * 0.8; // 천천히 감소
    player.crouchOff(); // 일어서 있기 (기본 자세)
  }
}

// 화면 밖으로 나간 발판은 지우고, 새로운 발판을 계속 만드는 함수 (무한 맵)
function updateInfinitePlatforms() {
  // 1. 화면 왼쪽으로 완전히 사라진 발판/장애물 제거 (메모리 절약)
  platforms = platforms.filter(p => (p.x + p.w - worldOffset) > -width);
  obstacles = obstacles.filter(o => (o.x + o.w - worldOffset) > -width);

  // 2. 가장 오른쪽에 있는 발판 찾기
  let lastP = platforms[platforms.length - 1];
  let farthestX = lastP ? lastP.x + lastP.w : 0;
  let prevY = lastP ? lastP.y : height/2;

  // 3. 화면 오른쪽 끝보다 더 멀리 발판을 미리 생성해둠 (끊기지 않게)
  while (farthestX - worldOffset < width * 1.5) {
    let gap = random(15, 25); // 점프해서 건너갈 구멍 크기
    let newX = farthestX + gap;
    addRandomPlatform(newX, prevY);
    
    // 갱신
    lastP = platforms[platforms.length - 1];
    farthestX = lastP.x + lastP.w;
    prevY = lastP.y;
  }
}

// ==========================================
// 6. ML5 얼굴 감지 로직
// ==========================================

function setupFaceAPI() {
  console.log("setupFaceAPI 호출됨");

  if (!cam) {
    console.warn("cam 이 없습니다. setup()에서 createCapture(VIDEO)를 확인해주세요.");
    return;
  }

  // 이미 모델이 준비되어 있으면 → 바로 게임 시작 & 감지 재시작
  if (isModelReady && faceapi) {
    console.log("이미 FaceAPI 모델 준비됨 → 바로 게임 시작");
    startGame();
    selectedMode = "face";
    faceapi.detect(gotResults);
    return;
  }

  // 처음 한 번만 FaceAPI 로딩
  if (!faceapi) {
    console.log("FaceAPI 로딩 시작");
    faceapi = ml5.faceApi(cam, DETECTION_OPTIONS, modelReady);
  }
}

// ==========================================
// 6-1. ML5 음성 인식 로직 (Voice Mode)
// ==========================================

function setupVoiceAPI() {
  console.log("setupVoiceAPI 호출됨");
  voiceLoadStartTime = millis(); // 로딩 시작 시간 기록

  // 이미 모델이 준비되어 있으면 → 캘리브레이션이 필요한지 확인
  if (voiceModelLoaded && pitch && audioStarted) {
    console.log("이미 Voice 모델 준비됨");
    // baselinePitch가 이미 설정되어 있으면 캘리브레이션 건너뛰기
    if (baselinePitch > 0) {
      console.log("이미 캘리브레이션 완료됨 (기준 음정:", baselinePitch.toFixed(2), "Hz) - 바로 게임 시작");
      calibrating = false;

      // ★★★ [수정된 부분] 여기서 getPitch()를 다시 실행시켜야 합니다! ★★★
      getPitch(); 
      
      startGame();
    } else {
      console.log("캘리브레이션 필요 - 캘리브레이션 시작");
      startVoiceCalibration();
    }
    return;
  }

  // 오디오 컨텍스트를 먼저 가져와서 활성화 (사용자 클릭 직후)
  audioContext = getAudioContext();
  if (audioContext) {
    // 오디오 컨텍스트를 즉시 활성화
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(err => {
        console.warn("오디오 컨텍스트 활성화 경고:", err);
      });
    }
  }

  // 마이크 시작
  console.log("마이크 시작 중...");
  mic = new p5.AudioIn();
  mic.start(() => {
    console.log("✓ 마이크 시작됨");
    audioStarted = true;

    // 오디오 컨텍스트 재확인 및 활성화
    audioContext = getAudioContext();
    console.log("✓ 오디오 컨텍스트:", audioContext, "상태:", audioContext ? audioContext.state : "없음");
    if (!audioContext) {
      console.error("오디오 컨텍스트를 가져올 수 없습니다");
      handleVoiceLoadError("오디오 컨텍스트 초기화 실패");
      return;
    }

    // 오디오 컨텍스트를 명시적으로 활성화 (중요!)
    if (audioContext.state === 'suspended') {
      console.log("오디오 컨텍스트 활성화 중...");
      audioContext.resume().then(() => {
        console.log("✓ 오디오 컨텍스트 활성화 완료");
        loadPitchModel();
      }).catch((err) => {
        console.warn("오디오 컨텍스트 활성화 경고 (무시하고 계속):", err);
        // 경고가 나와도 계속 진행
        loadPitchModel();
      });
    } else {
      console.log("✓ 오디오 컨텍스트 이미 활성화됨");
      loadPitchModel();
    }
  }, (err) => {
    console.error("마이크 시작 에러:", err);
    handleVoiceLoadError("마이크 권한이 필요합니다. 브라우저 설정을 확인해주세요.");
  });
}

// 피치 모델 로드 함수 분리
function loadPitchModel() {
  // ml5 피치 감지 모델 로드 (로컬 모델 경로 사용)
  if (typeof ml5 !== 'undefined') {
    console.log("✓ ml5 로드됨, 버전:", ml5.version);
    console.log("CREPE 모델 로딩 시작...");
    
    // mic.stream이 없을 수 있으므로 확인
    if (!mic || !mic.stream) {
      console.error("마이크 스트림을 가져올 수 없습니다");
      handleVoiceLoadError("마이크 스트림 초기화 실패");
      return;
    }
    
    try {
      pitch = ml5.pitchDetection('./audio_models/crepe/', audioContext, mic.stream, voiceModelReady);
      if (!pitch) {
        console.error("피치 감지 객체 생성 실패");
        handleVoiceLoadError("피치 감지 모델 초기화 실패");
      }
    } catch (err) {
      console.error("모델 로드 에러:", err);
      handleVoiceLoadError("모델 로드 실패: " + err.message);
    }
  } else {
    console.error("ml5가 로드되지 않았습니다");
    handleVoiceLoadError("ml5 라이브러리가 로드되지 않았습니다");
  }
}

// Voice 모드 로드 오류 처리
function handleVoiceLoadError(message) {
  console.error("Voice 모드 로드 오류:", message);
  // 에러가 발생해도 게임을 시작하도록 함 (키보드로 테스트 가능하도록)
  console.log("⚠️ " + message + " - 키보드로 게임을 플레이할 수 있습니다.");
  voiceLoadStartTime = 0;
  startGame();
}

function voiceModelReady() {
  console.log("✓ 피치 감지 모델 로드 완료!");
  voiceModelLoaded = true;
  voiceLoadStartTime = 0; // 로딩 완료 표시
  
  // baselinePitch가 이미 설정되어 있으면 캘리브레이션 건너뛰기
  if (baselinePitch > 0) {
    console.log("이미 캘리브레이션 완료됨 (기준 음정:", baselinePitch.toFixed(2), "Hz) - 캘리브레이션 건너뛰기");
    calibrating = false;
    startGame();
  } else {
    console.log("캘리브레이션 시작 전...");
    startVoiceCalibration();
  }
}

function startVoiceCalibration() {
  calibrating = true;
  calibrationTime = 0;
  calibrationStartTime = millis(); // 캘리브레이션 시작 시간 기록
  calibrationFailCount = 0; // 실패 횟수 초기화
  pitchHistory = [];
  baselinePitch = 0;
  smoothedPitch = 0;
  lastValidPitch = 0;
  calibrationMessage = "편안한 음정으로 소리를 내주세요";
  console.log("캘리브레이션 시작...");
  
  // 피치 감지 시작
  getPitch();
  
  // 게임 시작 (캘리브레이션 중에도 게임 화면으로 전환)
  console.log("게임 시작 중...");
  startGame();
  console.log("게임 상태:", gameState);
}

// 캘리브레이션 건너뛰기
function skipCalibration() {
  console.log("캘리브레이션 건너뛰기");
  calibrating = false;
  baselinePitch = 0; // 기준 음정 없이 진행 (키보드로만 플레이)
  calibrationMessage = "캘리브레이션 건너뛰기 - 키보드로 플레이하세요";
}

function getPitch() {
  if (pitch && voiceModelLoaded && selectedMode === 'voice') {
    pitch.getPitch((err, frequency) => {
      if (err) {
        console.error(err);
      }

      let level = mic.getLevel();

      if (frequency && level > volumeThreshold) {
        let isValidPitch = true;

        if (lastValidPitch > 0) {
          let pitchChange = Math.abs(frequency - lastValidPitch);
          if (pitchChange > 300) {
            isValidPitch = false;
          }
        }

        if (isValidPitch) {
          currentPitch = frequency;
          currentNote = frequencyToNote(frequency);
          lastValidPitch = frequency;

          if (calibrating) {
            pitchHistory.push(frequency);
            calibrationTime++;

            if (calibrationTime >= 180) {
              // 캘리브레이션 완료 조건: 최소 50프레임 유효한 소리
              if (pitchHistory.length > 50) {
                baselinePitch = pitchHistory.reduce((a, b) => a + b) / pitchHistory.length;
                console.log("✅ 캘리브레이션 완료! 기준 음정 설정:", baselinePitch.toFixed(2), "Hz");
                calibrating = false;
                pitchHistory = [];
                calibrationMessage = "캘리브레이션 완료!";
              } else {
                // 유효한 소리가 충분하지 않으면 캘리브레이션 리셋
                console.log("⚠️ 캘리브레이션 실패: 소리가 충분하지 않습니다. (감지된 프레임:", pitchHistory.length, "/50) 재시도...");
                calibrationTime = 0;
                pitchHistory = [];
                calibrationMessage = "소리가 감지되지 않았습니다. 다시 시도합니다.";
              }
            }
          }
        }
      } else if (level <= volumeThreshold) {
        // 소리가 없으면 currentPitch만 0으로
        currentPitch = 0;
        currentNote = "";
      }

      if (selectedMode === 'voice') {
        getPitch();
      }
    });
  }
}

// 주파수(Hz)를 두 음 사이의 Cents 차이로 변환
function frequencyToCents(freq1, freq2) {
  if (!freq1 || !freq2) return 0; // 0으로 나누기 방지
  return 1200 * Math.log2(freq2 / freq1);
}

// 주파수를 음계로 변환하는 함수
function frequencyToNote(frequency) {
  if (frequency < 20) return "";

  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  // A4 = 440Hz를 기준으로 계산
  const A4 = 440;
  const C0 = A4 * Math.pow(2, -4.75); // C0 주파수

  const halfSteps = 12 * Math.log2(frequency / C0);
  const octave = Math.floor(halfSteps / 12);
  const noteIndex = Math.round(halfSteps % 12);

  const noteName = noteNames[noteIndex];

  return noteName + octave;
}

function modelReady() {
  console.log("FaceAPI Ready!");
  isModelReady = true;

  // 얼굴 감지 시작
  if (faceapi) {
    faceapi.detect(gotResults);
  }

  // 로딩 화면에서 넘어온 거라면 바로 게임 시작
  startGame();
  selectedMode = "face";  // 현재 모드 표시
}

function gotResults(err, result) {
  if (err) {
    faceapi.detect(gotResults);
    return;
  }
  detections = result; // 결과 저장

  // 얼굴이 1명이라도 감지되었다면
  if (detections && detections.length > 0) {
    const firstFace = detections[0];
    
    // 얼굴 각도 검사
    const angleCheck = checkFaceAngle(firstFace);
    faceAngleWarning = angleCheck.isBad;
    warningMessage = angleCheck.message;

    // 자세가 바를 때만 표정 인식 (자세가 나쁘면 중립으로 처리)
    if (!faceAngleWarning) {
        currentExpression = getDominantExpression(firstFace.expressions);
    } else {
        currentExpression = 'neutral';
    }
  } else {
    currentExpression = 'neutral';
    faceAngleWarning = false;
  }
  
  // 계속해서 다음 프레임 얼굴 감지 요청 (재귀 호출)
  if (selectedMode === 'face') {
    faceapi.detect(gotResults);
  }
}

// 얼굴 각도 계산 함수
function checkFaceAngle(detection) {
  if (!detection || !detection.landmarks) return { isBad: false, message: "" };

  // landmarks: 얼굴 특징점 68개
  const lm = detection.landmarks.positions;
  
  // 주요 부위 좌표 추출
  const leftEye = lm[36];     // 왼쪽 끝 (정밀한 계산을 위해)
  const rightEye = lm[45];    // 오른쪽 끝
  const nose = lm[30];        // 코 끝
  const mouthY = (lm[48].y + lm[54].y) / 2; // 입 양 끝의 y중앙
  
  // 두 눈 사이의 거리 (기준 길이로 사용 - 얼굴 크기에 따른 정규화를 위해 사용)
  const eyeDist = dist(leftEye.x, leftEye.y, rightEye.x, rightEye.y);
  // 눈 사이의 x, y 좌표
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;

  // 1. Roll (기울기): 양쪽 눈 높이 차이가 크면 고개를 기울인 것
  // eyeDist로 나누는 이유: 얼굴 크기에 비해 얼마나 기울어졌는지 확인하기 위해
  // (y 좌표의 차이로만 비교하면 카메라와의 거리에 따라 판단되기 때문에 가까우면 조금만 기울어도 수치상 많이 기우린 것으로 판단됨)
  if (abs(leftEye.y - rightEye.y) / eyeDist > CONFIG.thresholds.roll) {
    return { isBad: true, message: "고개를 반듯하게 세워주세요!" };
  }
  
  // 2. Yaw (좌우 회전): 코가 양 눈의 중심 x좌표에서 얼마나 벗어났는지 검사
  if (abs(nose.x - eyeMidX) / eyeDist > CONFIG.thresholds.yaw) {
    return { isBad: true, message: "정면을 봐주세요!" };
  }
  
  // 3. Pitch (상하 끄덕임): 눈~코 거리와 코~입 거리의 비율로 계산
  const eyeToNose = abs(nose.y - eyeMidY);
  const noseToMouth = abs(mouthY - nose.y);
  if (noseToMouth === 0) return { isBad: false, message: "" }; // 0으로 나누기 방지
  
  const pitchRatio = eyeToNose / noseToMouth; // 비율 계산

  // 비율이 너무 작으면 턱을 든 것, 크면 고개를 숙인 것
  if (pitchRatio < CONFIG.thresholds.pitchMin) return { isBad: true, message: "턱을 너무 들었습니다!" };
  if (pitchRatio > CONFIG.thresholds.pitchMax) return { isBad: true, message: "고개를 너무 숙였습니다!" };

  return { isBad: false, message: "" };
}

// 현재 표정 추출 (여러 표정 점수 중 가장 높은 것 하나 뽑기)
function getDominantExpression(expressions) {
    let maxScore = 0, dominant = 'neutral';
    for (const [expr, score] of Object.entries(expressions)) {
        if (score > maxScore) { maxScore = score; dominant = expr; }
    }
    return dominant;
}

// ==========================================
// 7. 클래스 정의 (Player)
// 플레이어 캐릭터의 데이터와 행동을 정의한 설계도
// ==========================================

class Player {
    constructor() {
      this.baseX = 100; // 화면 왼쪽에서의 고정 위치 (플레이어는 가만히 있고 배경이 움직임)
      this.size = 80;
      this.reset();
    }

    reset() {
      this.x = this.baseX;
      this.y = 0;
      this.vy = 0;       // 수직 속도 (Velocity Y)
      this.onGround = false;
      this.isDead = false;
      this.isCrouching = false;
    }

    update() {
      if (this.isDead) return;
      
      // [물리 공식] 속도와 가속도
      this.x = this.baseX;
      this.vy += CONFIG.gravity; // 속도에 중력을 더함 (점점 빨라짐)
      this.y += this.vy;         // 위치에 속도를 더함 (이동)
      this.onGround = false;     // 일단 공중에 있다고 가정 (충돌 체크에서 땅이면 수정)
    }

    jump() {
      if (this.onGround && !this.isDead) {
        this.vy = CONFIG.jumpPower; // 위쪽 방향 속도를 팍! 줌
        this.onGround = false;
      }
    }

    // 숙이기 시작
    crouchOn() {
        if (this.isDead) return;
        this.isCrouching = true;
    }

    // 숙이기 해제
    crouchOff() {
        this.isCrouching = false;
    }

    // 장애물과의 충돌 체크
    checkObstacleCollision(obstacles) {
      if (this.isDead) return;

      // 히트박스를 실제 이미지보다 조금 작게
      const hitW = this.size * 0.6; 
      const hitH = this.size * 0.7; 

      // 플레이어 월드 좌표 (중심 기준)
      const pxCenterWorld = this.x + worldOffset;
      const px1 = pxCenterWorld - this.size / 2;
      const px2 = pxCenterWorld + this.size / 2;
      const py1 = this.y - this.size / 2;
      const py2 = this.y + this.size / 2;

      for (let ob of obstacles) {
        // 장애물 AABB
        const ox1 = ob.x;
        const ox2 = ob.x + ob.w;
        const oy1 = ob.y - ob.h;
        const oy2 = ob.y;

        const overlap =
            px1 < ox2 &&
            px2 > ox1 &&
            py1 < oy2 &&
            py2 > oy1;

        if (!overlap) continue;

        // 타입별 판정
        if (ob.type === 'saw') {
          // 톱니 : 숙이고 있으면 통과, 아니면 죽음
          if (this.isCrouching) {
            // 숙인 상태면 그냥 통과 (충돌 무시)
            continue;
          } else {
            this.die();
            return;
          }
        }

        if (ob.type === 'spike') {
          // 스파이크 : 닿으면 바로 죽음
          this.die();
          return;
        }
      }
  }
  

    // 발판과 부딪혔는지 검사하는 함수
    checkCollision(platforms) {
        if (this.isDead) return;
        const pxWorld = this.x + worldOffset; // 플레이어의 실제 맵 상 위치 (화면위치 + 이동거리)
        const footY = this.y + this.size / 2; // 플레이어 발바닥 위치
        const prevFootY = footY - this.vy;    // 바로 직전 프레임의 발바닥 위치

        for (let p of platforms) {
          const pLeft = p.x;
          const pRight = p.x + p.w;
          const pTop = p.y - p.h;

          // 1. 가로 범위 체크: 플레이어가 발판 위에 있는가?
          if (pxWorld > pLeft + 10 && pxWorld < pRight - 10) { 
            // 2. 세로 범위 체크: 발이 발판 높이를 통과했는가?
            // (내려오는 중이고(vy>=0), 발은 발판 아래에, 직전엔 발판 위에 있었어야 함)
            if (this.vy >= 0 && footY >= pTop && prevFootY <= pTop + 10) {
              this.y = pTop - this.size / 2; // 발판 위로 위치 고정
              this.vy = 0; // 떨어지는 속도 없애기
              this.onGround = true; // 땅에 닿음 판정
              return; 
            }
          }
        }
    }

    die() {
      if (this.isDead) return;
      this.isDead = true;
      gameState = 'gameover';
      bestScore = max(bestScore, score);
    }

    // 물에 빠졌는지 체크
    checkFall() {
      if (this.y > height + this.size) {
        this.die();
      } 
    }

    // 화면에 그리기
    show() {
        let currentImg;
        if (!this.onGround) {
          currentImg = assets.jump; // 점프 중 이미지
        } else if (this.isCrouching) {
          currentImg = assets.down;  // 숙이는 이미지
        } else currentImg = assets.idle; // 걷는 이미지

        push(); // 현재 그리기 설정을 저장
        translate(this.x, this.y); // 플레이어 위치로 좌표계 이동
        scale(-1, 1); // [거울모드] 좌우 반전 (이미지가 반대로 보이면 이거 조절)
        imageMode(CENTER);
        
        if (currentImg) image(currentImg, 0, 0, this.size * 1.6, this.size * 1.8);
        else { fill(255, 0, 0); rect(0, 0, this.size, this.size); } // 이미지가 없으면 빨간 네모로 표시
        
        pop(); // 저장했던 설정 복구
    }
}

// ==========================================
// 7-1. 클래스 정의 (Obstacle)
// 바닥 스파이크 / 공중 톱니 장애물
// ==========================================

class Obstacle {
  // type: 'spike' | 'saw'
  // x, y 는 "월드 좌표" (platform과 동일하게 worldOffset으로 스크롤됨)
  constructor(type, x, y) {
      this.type = type;
      this.x = x;
      this.y = y;

      // 크기는 CONFIG에서 가져오기
      if (type === 'spike') {
          this.w = CONFIG.obstacle.spikeSize;
          this.h = CONFIG.obstacle.spikeSize;
      } else { // 'saw'
          this.w = CONFIG.obstacle.sawSize;
          this.h = CONFIG.obstacle.sawSize;
      }

      this.angle = 0; // 톱니 회전용
  }

  update() {
      // 맵 스크롤은 worldOffset으로 처리하니까 x는 그대로 두고
      // 공중 톱니만 회전 애니메이션
      if (this.type === 'saw') {
          this.angle += 0.08;  // 숫자 키우면 더 빨리 돎
      }
  }

  draw() {
      if (this.type === 'spike') this.drawSpike();
      else if (this.type === 'saw') this.drawSaw();
  }

  // 땅(발판) 위에 꽂힌 뾰족 압정
  drawSpike() {
      push();
      noStroke();
      fill(80); // 회색 본체

      // 삼각형 하나 (위로 뾰족)
      const baseY = this.y;
      const tipY = this.y - this.h;
      const leftX = this.x;
      const rightX = this.x + this.w;
      const midX = (leftX + rightX) / 2;

      triangle(leftX, baseY, rightX, baseY, midX, tipY);

      // 밑에 작은 네모(받침대)
      fill(40);
      rect(leftX + this.w*0.2, baseY - 5, this.w*0.6, 5);

      pop();
  }

  // 공중에서 빙글빙글 도는 톱니
  drawSaw() {
      push();
      // 중심으로 이동 후 회전
      const cx = this.x + this.w/2;
      const cy = this.y - this.h/2;
      translate(cx, cy);
      rotate(this.angle);

      // 톱니 모양 (단순화 버전: 바깥 톱니 + 안쪽 원)
      noStroke();
      fill(230);

      // 바깥 톱니 (다각형 느낌)
      const rOuter = this.w/2;
      const rInner = this.w/2 - 10;
      const teeth = 8;
      beginShape();
      for (let i = 0; i < teeth; i++) {
          const a1 = TWO_PI * (i / teeth);
          const a2 = TWO_PI * ((i + 0.5) / teeth);
          vertex(cos(a1)*rOuter, sin(a1)*rOuter);
          vertex(cos(a2)*rInner, sin(a2)*rInner);
      }
      endShape(CLOSE);

      // 가운데 동그라미
      fill(80);
      circle(0, 0, this.w*0.4);

      pop();
  }
}


// ==========================================
// 8. 그리기 및 UI 헬퍼 함수들
// ==========================================

// 웹캠 배경 (비율 유지 + 크롭 + 좌우 반전)
function drawWebcamBackground() {
  // 웹캠이 아직 준비 안 됐으면 검은 화면
  if (!cam || cam.width === 0) {
    background(0); return; 
  }
    
  // 화면 비율에 맞춰 꽉 차게 늘리기
  const scaleFactor = max(width / cam.width, height / cam.height);
  
  push();
  translate(width / 2, height / 2);
  scale(-scaleFactor, scaleFactor); // 좌우 반전 + 확대
  imageMode(CENTER);
  image(cam, 0, 0);
  pop();
}

function drawWorld(animateWaves) {
  if (animateWaves) {
      waveAnimOffset += 0.8;
  }

  // 뒷쪽 파도
  drawWaveLayer(assets.waves[0], height - 200, 0.4);
  drawWaveLayer(assets.waves[1], height - 170, 0.6);

  // 발판 + 장애물을 월드 좌표 기준으로 함께 스크롤
  push();
  translate(-worldOffset, 0);

  // 1) 발판
  for (let p of platforms) {
      drawSinglePlatform(p);
  }

  // 2) 장애물
  for (let o of obstacles) {
      o.update();  // 톱니 회전
      o.draw();    // 모양 그리기
  }

  pop();

  // 앞쪽 파도
  drawWaveLayer(assets.waves[2], height - 155, 0.8);
  drawWaveLayer(assets.waves[3], height - 140, 1.1);
}


function drawSinglePlatform(p) {
    // 발판 색상 정의
    const darkGreen = color(42, 135, 64);
    const lightGreen = color(72, 170, 92);
    const brown = color(186, 129, 74);
    const topY = p.y - p.h;
    
    fill(brown); noStroke();
    // 기둥 그리기
    const pillarW = p.w * 0.7;
    rect(p.x + (p.w - pillarW)/2, p.y, pillarW, height - p.y); 
    
    // 발판 윗면 그리기
    fill(darkGreen); rect(p.x, topY, p.w, p.h, 20, 20, 0, 0); // 둥근 모서리
    fill(lightGreen); rect(p.x, topY, p.w, p.h * 0.7, 20, 20, 0, 0); // 입체감용 밝은 면
}

function drawWaveLayer(img, y, speed) {
    if (!img) return;
    // 파도가 끊기지 않고 계속 연결
    let offset = floor((waveAnimOffset * speed) % width);
    imageMode(CORNER);
    // 파도 그림 2개를 이어 붙여서 무한 스크롤 구현
    image(img, -offset, y, width, 150);
    image(img, width - offset, y, width, 150);
}

function drawPlayer() {
    player.show();
}

// 시작 화면
function drawIntroScreen() {
  // 배경
  if (assets.introBg) {
    push();
    imageMode(CORNER);    
    image(assets.introBg, 0, 0, width, height);
    pop();
  } else {
    background(20);
  }

  // 로고
  if (assets.logo) {
    let wiggleY = sin(frameCount * 0.05) * 8;
    imageMode(CENTER);
    image(
      assets.logo,
      width / 2,
      height / 2 - 250 + wiggleY,
      380,   // 로고 크기 조정
      180
    );
  }

  // START 버튼
  if (assets.startBtn) {
    drawImageButton(startBtn, assets.startBtn);
  }
}

function drawRuleScreen() {
  // 배경
  if (assets.ruleBg) {
    push();
    imageMode(CORNER);
    image(assets.ruleBg, 0, 0, width, height);
    pop();
  }

  // 룰 설명 박스
  let panelW = width - 80;
  let panelH = 650;
  let panelX = (width - panelW) / 2;
  let panelY = height / 2 - panelH / 2;

  fill(255, 255, 255, 230);
  rect(panelX, panelY, panelW, panelH, 25);

  // 우하단 '게임 모드 선택하기' 버튼
  if (assets.nextBtn) {
    drawImageButton(ruleNextBtn, assets.nextBtn);
  }

  // 다음 화면 넘어가기 버튼
  drawRuleNextControl();
}

function drawRuleNextControl() {
  // 클릭 영역을 ruleNextBtn에 맞춤
  ruleNextBtn.w = 260;
  ruleNextBtn.h = 50;
  ruleNextBtn.x = width - ruleNextBtn.w - 40;
  ruleNextBtn.y = height - ruleNextBtn.h - 40;

  let x = ruleNextBtn.x;
  let y = ruleNextBtn.y;
  let w = ruleNextBtn.w;
  let h = ruleNextBtn.h;

  // 마우스 올렸는지 체크 (hover 효과용)
  let hover =
    mouseX > x && mouseX < x + w &&
    mouseY > y && mouseY < y + h;

  // 배경 살짝 칠해주기 (클릭 영역 표시)
  noStroke();
  fill(hover ? 255 : 240, 240, 240, 210);
  rect(x, y, w, h, 20);

  // 삼각형(▶) 그리기
  let triCx = x + 20;          // 삼각형 중심 x
  let triCy = y + h / 2;       // 삼각형 중심 y
  let triSize = 10;            // 삼각형 크기

  fill(hover ? 80 : 100);
  noStroke();
  triangle(
    triCx - triSize, triCy - triSize,
    triCx - triSize, triCy + triSize,
    triCx + triSize, triCy
  );

  // 텍스트: "게임 모드 선택하기"
  textFont(assets.titleFont);
  textAlign(LEFT, CENTER);
  textSize(18);
  fill(hover ? 50 : 80);
  text("게임 모드 선택하기", triCx + 15, triCy);
}


// 모드 선택 화면
function drawModeSelectScreen() {
  // 배경
  if (assets.ruleBg) {
    push();
    imageMode(CORNER);
    image(assets.ruleBg, 0, 0, width, height);
    pop();
  }
  
  // 제목
  fill(255);
  textAlign(CENTER, CENTER);
  textFont(assets.titleFont);
  textSize(33);
  text("게임 모드를 선택하세요", width / 2, height / 2 - 160);

  // 버튼 이미지
  imageMode(CORNER); 

  // 버튼
  drawImageButton(faceBtn, assets.faceBtn);
  drawImageButton(voiceBtn, assets.voiceBtn);

}

// 로딩 바 그리기
function drawLoadingScreen() {
  fill(0, 150); // 반투명 검은 배경
  rect(0, 0, width, height);
    
  fill(255); textAlign(CENTER, CENTER);
  if (selectedMode === 'voice') {
    textSize(32); text("Loading Voice Model...", width/2, height/2 - 20);
    
    // 모델이 로드되었지만 아직 게임이 시작되지 않은 경우 (안전장치)
    if (voiceModelLoaded && gameState === 'loading') {
      console.log("⚠️ 모델 로드 완료되었으나 게임이 시작되지 않음 - 강제 시작");
      startVoiceCalibration();
    }
    
    // Voice 모드 타임아웃 체크 (10초)
    if (voiceLoadStartTime > 0) {
      let elapsed = millis() - voiceLoadStartTime;
      if (elapsed > 10000) {
        console.warn("Voice 모드 로딩 타임아웃 - 게임 시작");
        voiceLoadStartTime = 0;
        // 모델이 로드되지 않았어도 게임 시작 (키보드로 플레이 가능)
        if (!voiceModelLoaded) {
          handleVoiceLoadError("모델 로딩이 시간 초과되었습니다. 키보드로 플레이할 수 있습니다.");
        } else if (gameState === 'loading') {
          // 모델은 로드되었지만 게임이 시작되지 않은 경우
          console.log("모델 로드 완료 - 게임 시작");
          startVoiceCalibration();
        }
      }
    }
  } else {
    textSize(32); text("Loading Face Model...", width/2, height/2 - 20);
  }
    
  // 로딩 게이지 테두리
  noFill(); stroke(255);
  rect(width/2 - 100, height/2 + 30, 200, 20);
    
  // 차오르는 로딩 바 (가짜 로딩이지만 시각적 효과)
  fill(255); noStroke();
  let loadingW = (frameCount % 60) / 60 * 196; 
  rect(width/2 - 98, height/2 + 32, loadingW, 16);
}

// Voice 모드 캘리브레이션 오버레이
function drawCalibrationOverlay() {
  fill(0, 200);
  rect(0, 0, width, height);

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(24);
  text("캘리브레이션 중...", width / 2, height / 2 - 50);
  
  textSize(16);
  fill(200);
  text(calibrationMessage, width / 2, height / 2);
  text("(3초간 기준 음정을 설정합니다)", width / 2, height / 2 + 30);

  // 진행 바
  let progress = calibrationTime / 180;
  let barWidth = 300;
  noFill();
  stroke(255);
  rect(width / 2 - barWidth / 2, height / 2 + 70, barWidth, 20);
  fill(100, 200, 255);
  noStroke();
  rect(width / 2 - barWidth / 2, height / 2 + 70, barWidth * progress, 20);
}

function drawGameOverScreen() {
  fill(0, 180); rect(0, 0, width, height);
  fill(255); textAlign(CENTER, CENTER);
  textSize(50); text("GAME OVER", width/2, height/2 - 50);
  textSize(30); text(`Score: ${score}s`, width/2, height/2 + 20);
  textSize(20); text("Press SPACE to Menu", width/2, height/2 + 120);
}

function drawScore() {
  fill(255); textSize(30); textAlign(LEFT, TOP);
  text(`Time: ${score}s`, 20, 20);
}

function drawWarningOverlay() {
  fill(0, 200); rect(0, 0, width, height);
  fill(255, 50, 50); textSize(35); textAlign(CENTER, CENTER);
  text("⚠️ 각도 주의 ⚠️", width / 2, height / 2 - 50);
  fill(255); textSize(25); text(warningMessage, width / 2, height / 2 + 20);
}

// ==========================================
// 9. 입력 처리 (INPUT)
// ==========================================

function mousePressed() {

  // 1) 인트로 화면 → Start 버튼 클릭하면 룰 화면으로
  if (gameState === 'intro') {
    if (isInside(startBtn)) {
      gameState = 'rule';
      return;
    }
  }

  // 2) 게임 룰 화면 → 우측 하단 ▶ '게임 모드 선택하기'
  else if (gameState === 'rule') {
    if (isInside(ruleNextBtn)) {
      gameState = 'modeSelect';
      return;
    }
  }

  // 3) 모드 선택 화면 → Face / Voice 모드 버튼
  else if (gameState === 'modeSelect') {

    // ▶ 얼굴 모드 (Face Mode)
    if (isInside(faceBtn)) {
      selectedMode = 'face';
      gameState = 'loading';   // 얼굴 모델 로딩 화면으로 이동
      setupFaceAPI();          // 얼굴 인식 로딩 시작
      return;
    }

    // ▶ 음성 모드 (Voice Mode)
    if (isInside(voiceBtn)) {
      selectedMode = 'voice';
      gameState = 'loading';   // 음성 모델 로딩 화면으로 이동
      setupVoiceAPI();         // 음성 인식 로딩 시작
      return;
    }
  }

  // 4) 게임 오버 화면 → 클릭하면 모드 선택 화면으로
  else if (gameState === 'gameover') {
    gameState = 'modeSelect';
    selectedMode = null;
  }
}

function startGame() {
  console.log("startGame() 호출됨 - 이전 상태:", gameState);
  initGame();
  startTime = millis();
  gameState = 'playing';
  console.log("startGame() 완료 - 현재 상태:", gameState);
}

// ==========================================
// 10. 키보드 입력 처리
// ==========================================

function keyPressed() {
  // 게임 오버 화면에서 스페이스바로 메뉴로
  if (keyCode === 32) { // SPACE
    if (gameState === 'gameover') {
      gameState = 'modeSelect';
      selectedMode = null;
    }
  }

  // Voice 모드에서 'C' 키로 재보정
  if ((key === 'c' || key === 'C') && selectedMode === 'voice' && gameState === 'playing') {
    startVoiceCalibration();
  }
}
