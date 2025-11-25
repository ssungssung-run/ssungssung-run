// ==========================================
// 1. 게임 설정 (CONFIGURATION)
// 게임의 난이도나 물리 법칙을 여기서 한꺼번에 조절합니다.
// ==========================================

const CONFIG = {
    gameW: 520,         // 게임 화면의 가로 너비 (모바일 비율 고려)
    waterRatio: 0.83,   // 화면 아래쪽 물이 차오르는 높이 비율

    // [물리 엔진 설정]
    gravity: 0.7,       // 중력: 매 프레임마다 아래로 당기는 힘 (클수록 빨리 떨어짐)
    jumpPower: -14,     // 점프력: 위로 솟구치는 힘 (음수여야 화면 위쪽인 Y=0 방향으로 감)
    moveSpeed: 5,       // 맵 이동 속도: 배경이 왼쪽으로 흐르는 속도

    // [발판(플랫폼) 생성 규칙]
    platform: {
        minYRatio: 0.4, // 발판이 생성될 수 있는 가장 높은 위치 (화면 상단 40%)
        maxYRatio: 0.7, // 발판이 생성될 수 있는 가장 낮은 위치 (화면 하단 70%)
        maxDeltaY: 90,  // 다음 발판이 이전 발판보다 얼마나 높거나 낮을 수 있는지 (난이도 조절)    
        wNormal: { min: 150, max: 230 }, // 일반 발판 너비 범위
        wThin: { min: 60, max: 90 },     // 좁은 발판 너비 범위
        thinProb: 0.3   // 좁은 발판이 나올 확률 (0.3 = 30%)    
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

// 이미지 파일들을 담아둘 객체
let assets = {
    introBg: null, logo: null, idle: null, jump: null, waves: []
};

let isModelReady = false;   // AI 모델이 로딩 다 됐는지 확인하는 깃발

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

// 얼굴 인식 결과 저장용
let detections = [];
let currentExpression = 'neutral'; // 현재 표정 (happy, neutral 등)
let faceAngleWarning = false;      // 자세가 나쁜지 체크
let warningMessage = "";           // 경고 메시지 내용

// ==========================================
// 3. 초기화 (SETUP)
// ==========================================

// 이미지 로드
function preload() {
    assets.introBg = loadImage("images/intro_bg.png");
    assets.logo = loadImage("images/logo.png");
    assets.idle = loadImage("images/슝슝이.png");
    assets.jump = loadImage("images/슝슝이J.png");
    assets.waves[0] = loadImage("images/wave1.png");
    assets.waves[1] = loadImage("images/wave2.png");
    assets.waves[2] = loadImage("images/wave3.png");
    assets.waves[3] = loadImage("images/wave4.png");
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
}

function windowResized() {
    resizeCanvas(CONFIG.gameW, windowHeight);
    centerCanvas();
    waterLevel = height * CONFIG.waterRatio;
}

// 캔버스를 브라우저 화면 정중앙에 위치시키는 계산
function centerCanvas() {
    canvas.position((windowWidth - width) / 2, 0);
}

// ==========================================
// 4. 메인 루프 (DRAW)
// ==========================================

function draw() {
    // 1) 웹캠 배경 항상 먼저
    drawWebcamBackground();

    // 2) 현재 게임 상태(gameState)에 따라 다른 화면을 보여주기
    if (gameState === 'intro') {
        drawIntroScreen(); // 시작 화면
    } 
    else if (gameState === 'modeSelect') {
        drawModeSelectScreen(); // 모드 선택 화면
    } 
    else if (gameState === 'loading') {
        drawLoadingScreen(); // 로딩 화면
    }
    else if (gameState === 'playing') {
        runGame(); // 실제 게임 플레이 로직 실행
    } 
    else if (gameState === 'gameover') {
        // 게임 오버지만 배경은 멈춘 상태로 그려줌
        drawWorld(false); 
        drawPlayer();     
        drawGameOverScreen();
    }

    // 얼굴 모드일 때 각도가 틀어지면 경고창 띄우기
    if (selectedMode === 'face' && faceAngleWarning && gameState === 'playing') {
        drawWarningOverlay();
    }
}

// ==========================================
// 5. 게임 로직 (GAME LOGIC)
// ==========================================

function runGame() {
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
    
    player.reset(); // 플레이어 위치 초기화
    
    platforms = []; // 기존 발판 싹 비우기

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

    platforms.push({ x: startX, y: y, w: w, h: 40 });
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
    if (player.onGround) { // 땅에 있을 때만 점프 가능
        if (selectedMode === 'face') {
            // 행복하거나 놀란 표정이면 점프!
            if (currentExpression === 'happy' || currentExpression === 'surprised') {
                player.jump();
            }
        } 
        else if (selectedMode === 'voice') {
            // TODO: 음성 로직
        }

        // 키보드 테스트용 (위 화살표나 스페이스바)
        if (keyIsDown(UP_ARROW) || keyIsDown(32)) { 
            player.jump();
        }
    }
}

// 화면 밖으로 나간 발판은 지우고, 새로운 발판을 계속 만드는 함수 (무한 맵)
function updateInfinitePlatforms() {
    // 1. 화면 왼쪽으로 완전히 사라진 발판 제거 (메모리 절약)
    platforms = platforms.filter(p => (p.x + p.w - worldOffset) > -width);

    // 2. 가장 오른쪽에 있는 발판 찾기
    let lastP = platforms[platforms.length - 1];
    let farthestX = lastP ? lastP.x + lastP.w : 0;
    let prevY = lastP ? lastP.y : height/2;

    // 3. 화면 오른쪽 끝보다 더 멀리 발판을 미리 생성해둠 (끊기지 않게)
    while (farthestX - worldOffset < width * 1.5) {
        let gap = random(100, 180); // 점프해서 건너갈 구멍 크기
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
    if (isModelReady) {
        modelReady();
        return;
    }
    // 모델이 없다면 로딩 시작
    if (!faceapi) {
        faceapi = ml5.faceApi(cam, DETECTION_OPTIONS, modelReady);
    }
}

function modelReady() {
    console.log('FaceAPI Ready!');
    isModelReady = true;
    
    // 얼굴 감지 시작 및 콜백으로 gotResults 함수 호출
    faceapi.detect(gotResults);
    
    if (gameState === 'loading' && selectedMode === 'face') {
        startGame();
    }
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

    // 물에 빠졌는지 체크
    checkFall() {
        if (this.y > height + this.size) { // 화면 아래로 사라지면
            this.isDead = true;
            gameState = 'gameover';
            bestScore = max(bestScore, score); // 최고 점수 갱신
        }
    }

    // 화면에 그리기
    show() {
        let currentImg;
        if (!this.onGround) currentImg = assets.jump; // 점프 중 이미지
        else currentImg = assets.idle; // 걷는 이미지

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
// 8. 그리기 및 UI 헬퍼 함수들
// ==========================================

// 웹캠 배경 (비율 유지 + 크롭 + 좌우 반전)
function drawWebcamBackground() {
    // 웹캠이 아직 준비 안 됐으면 검은 화면
    if (!cam || cam.width === 0) { background(0); return; }
    
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
        waveAnimOffset += 0.8; // 파도 움직임 속도
    }
    // 멀리 있는 파도 먼저 그림 (레이어 순서)
    drawWaveLayer(assets.waves[0], height - 200, 0.4);
    drawWaveLayer(assets.waves[1], height - 180, 0.6);

    push();
    translate(-worldOffset, 0); // 전체 맵을 worldOffset 만큼 왼쪽으로 밈 (플레이어가 이동하는 효과)
    for (let p of platforms) {
        drawSinglePlatform(p);
    }
    pop();

    // 가까이 있는 파도를 나중에 그림 (발판을 살짝 가리게)
    drawWaveLayer(assets.waves[2], height - 170, 0.8);
    drawWaveLayer(assets.waves[3], height - 160, 1.1);
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
    // 파도가 끊기지 않고 계속 연결되도록 나머지 연산(%) 사용
    let offset = (waveAnimOffset * speed) % width;
    imageMode(CORNER);
    // 파도 그림 2개를 이어 붙여서 무한 스크롤 구현
    image(img, -offset, y, width, 150);
    image(img, width - offset, y, width, 150);
}

function drawPlayer() {
    player.show();
}

// 시작 화면 그리기
function drawIntroScreen() {
    if(assets.introBg) image(assets.introBg, 0, 0, width, height);
    if(assets.logo) image(assets.logo, width/2 - 250, height/2 - 300, 500, 200);
    fill(255); textAlign(CENTER, CENTER);
    textSize(40); text("CHICKEN SCREAM", width/2, height/2);
    textSize(20); text("Press SPACE to Start", width/2, height/2 + 60);
}

// 모드 선택 화면
function drawModeSelectScreen() {
    if(assets.introBg) image(assets.introBg, 0, 0, width, height);
    fill(255); textAlign(CENTER, CENTER);
    textSize(40); text("Select Mode", width/2, height/2 - 80);
    textSize(30); text("[1] Face Mode", width/2, height/2);
    text("[2] Voice Mode", width/2, height/2 + 60);
}

// 로딩 바 그리기
function drawLoadingScreen() {
    fill(0, 150); // 반투명 검은 배경
    rect(0, 0, width, height);
    
    fill(255); textAlign(CENTER, CENTER);
    textSize(32); text("Loading Face Model...", width/2, height/2 - 20);
    
    // 로딩 게이지 테두리
    noFill(); stroke(255);
    rect(width/2 - 100, height/2 + 30, 200, 20);
    
    // 차오르는 로딩 바 (가짜 로딩이지만 시각적 효과)
    fill(255); noStroke();
    let loadingW = (frameCount % 60) / 60 * 196; 
    rect(width/2 - 98, height/2 + 32, loadingW, 16);
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

function keyPressed() {
    // 인트로 화면일 때
    if (gameState === 'intro') {
        if (key === ' ' || keyCode === ENTER) gameState = 'modeSelect';
    }
    // 모드 선택 화면일 때
    else if (gameState === 'modeSelect') {
        if (key === '1') { 
            selectedMode = 'face';
            gameState = 'loading';
            setupFaceAPI(); // 얼굴 모델 로딩 및 게임 시작
        }
        else if (key === '2') { 
            selectedMode = 'voice'; 
            startGame();
        }
    }
    // 게임 오버 화면일 때
    else if (gameState === 'gameover') {
        if (key === ' ') { gameState = 'modeSelect'; selectedMode = null; }
    }
}

function startGame() {
    initGame();
    startTime = millis();
    gameState = 'playing';
}
