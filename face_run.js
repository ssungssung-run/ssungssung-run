/**
 * Happy Jump Game with Face Alignment Check
 * ML5.js FaceAPI + P5.js
 * * 얼굴 표정을 인식하여 캐릭터를 조작하고,
 * 얼굴의 각도가 틀어지면 경고를 보내는 게임입니다.
 */

// ==========================================
// 1. 게임 설정 (CONFIGURATION)
// ==========================================

/**
 * 게임의 전체 설정값들을 담은 객체입니다.
 * @constant
 * @type {object}
 * @property {number} canvasW - 캔버스 너비
 * @property {number} canvasH - 캔버스 높이
 * @property {number} groundHeight - 바닥의 높이
 * @property {number} videoScale - 디버깅용 웹캠 화면의 축소 비율 (0 ~ 1)
 * @property {object} thresholds - 얼굴 각도 감지 민감도 설정
 */
const CONFIG = {
    canvasW: 800,
    canvasH: 450,
    groundHeight: 40,
    videoScale: 0.25, 
    
    /**
     * 얼굴 각도 허용 임계값 설정
     * 값이 작을수록 검사가 엄격해집니다.
     */
    thresholds: {
        /** 고개 기울기 (Roll) 허용치 (눈의 Y좌표 차이 비율) */
        roll: 0.15,
        /** 좌우 회전 (Yaw) 허용치 (코가 중심에서 벗어난 정도) */
        yaw: 0.25,
        /** 턱 들림 (Pitch Up) 허용치 (눈-코 거리 / 코-입 거리) - 낮을수록 엄격 */
        pitchMin: 0.4,
        /** 고개 숙임 (Pitch Down) 허용치 - 높을수록 엄격 */
        pitchMax: 1.8
    }
};

/**
 * ML5 FaceAPI 초기화 옵션
 * 표정 인식을 위해서는 반드시 descriptors와 expressions가 true여야 합니다.
 * @constant
 */
const DETECTION_OPTIONS = {
    withLandmarks: true,    // 얼굴 특징점 (얼굴 구성요소의 점 찍기 - 얼굴 각도 계산)
    withDescriptors: true,  // 얼굴 설명자 (얼굴 생김새를 나타내는 디지털 지문)
    withExpressions: true   // 표정 (감정 분석)
};

// ==========================================
// 2. 전역 변수 (GLOBAL VARIABLES)
// ==========================================

/** @type {object} ML5 FaceAPI 인스턴스 */
let faceapi;

/** @type {object} P5.js 비디오 캡처 객체 */
let video;

/** * 감지된 얼굴 데이터 배열
 * @type {Array<object>} 
 */
let detections = [];

// --- 게임 객체 ---
/** @type {Player} 플레이어 인스턴스 */
let player;

/** @type {Array<Obstacle>} 장애물 객체 배열 */
let obstacles = [];

/** @type {number} 땅의 Y 좌표 (계산된 값) */
let groundY;

// --- 게임 상태 ---
/** * 현재 게임의 진행 상태
 * @type {'start'|'playing'|'gameOver'} 
 */
let gameState = 'start';

/** @type {number} 현재 점수 */
let score = 0;

/** * 현재 감지된 가장 강한 표정 (예: 'happy', 'neutral')
 * @type {string} 
 */
let currentExpression = 'neutral';

// --- 경고 상태 ---
/** @type {boolean} 얼굴 각도 불량 여부 (true면 게임 일시정지) */
let faceAngleWarning = false;

/** @type {string} 화면에 표시할 구체적인 경고 메시지 */
let warningMessage = "";

// ==========================================
// 3. 초기화 및 설정 (SETUP & INIT)
// ==========================================

/**
 * P5.js 초기화 함수
 * 캔버스 생성, 비디오 설정, ML5 모델 로드, 플레이어 생성을 담당합니다.
 */
function setup() {
    createCanvas(CONFIG.canvasW, CONFIG.canvasH);
    groundY = height - CONFIG.groundHeight;

    // 비디오 설정
    video = createCapture(VIDEO);
    video.size(width, height);
    video.hide(); // HTML 비디오 요소는 숨기고 캔버스에 그림

    // ML5 초기화 (콜백으로 modelReady 호출)
    faceapi = ml5.faceApi(video, DETECTION_OPTIONS, modelReady);

    // 플레이어 생성 및 초기화
    player = new Player();
    // player.reset();
}

/**
 * ML5 모델 로드가 완료되면 호출되는 콜백 함수
 * 최초의 얼굴 감지를 시작합니다.
 */
function modelReady() {
    console.log('FaceAPI Model Ready!');
    // 얼굴 분석 및 콜백으로 gotResults 함수 호출
    faceapi.detect(gotResults);
}

// ==========================================
// 4. 메인 루프 (DRAW LOOP)
// ==========================================

/**
 * P5.js 메인 루프 함수 (매 프레임 실행)
 * 게임의 그리기 순서를 제어합니다.
 */
function draw() {
    background(0); // 검은 배경

    // 1. 디버그용 미러링 비디오 그리기 (왼쪽 상단)
    drawDebugVideo();

    // 2. 땅 그리기
    drawGround();

    // 3. 게임 상태에 따른 화면 분기 처리
    if (gameState === 'playing') {
        runGame();
    } else if (gameState === 'start') {
        drawStartScreen();
    } else if (gameState === 'gameOver') {
        drawGameOverScreen();
    }

    // 4. 얼굴 각도 경고 오버레이 (가장 위에 표시)
    if (faceAngleWarning) {
        drawWarningOverlay();
    }
}

// ==========================================
// 5. ML5 얼굴 감지 로직 (FACE DETECTION)
// ==========================================

/**
 * 얼굴 감지 결과를 처리하는 콜백 함수
 * 재귀적으로 호출되어 지속적인 감지를 수행합니다.
 * * @param {object} err - 에러 객체 (없으면 null)
 * @param {Array} result - 감지된 얼굴 데이터 배열
 */
function gotResults(err, result) {
    if (err) {
        console.error(err);
        faceapi.detect(gotResults); // 에러 발생 시에도 재시도
        return;
    }

    // detections에는 감지된 사람들의 얼굴 데이터가 있음 (사람이 여러명일 수도 있음)
    detections = result;

    if (detections && detections.length > 0) {
        // 감지된 사람 중 제일 큰(앞에 있는) 사람 얼굴 데이터
        const firstFace = detections[0];
        
        // 1. 얼굴 각도 검사
        const angleCheck = checkFaceAngle(firstFace);
        faceAngleWarning = angleCheck.isBad;
        warningMessage = angleCheck.message;

        // 2. 각도가 정상일 때만 표정 인식 수행
        if (!faceAngleWarning) {
            currentExpression = getDominantExpression(firstFace.expressions);
        } else {
            currentExpression = 'neutral'; // 각도가 나쁘면 중립 상태 유지
        }
    } else {
        // 얼굴이 감지되지 않음
        currentExpression = 'neutral';
        faceAngleWarning = false;
    }

    // 다음 프레임 감지 요청
    faceapi.detect(gotResults); 
}

/**
 * 표정 객체에서 가장 점수가 높은 표정의 이름을 반환합니다.
 * * @param {object} expressions - 표정별 확률 객체 (예: {happy: 0.9, sad: 0.01 ...})
 * @returns {string} 가장 높은 점수의 표정 이름 (예: "happy")
 */
function getDominantExpression(expressions) {
    let maxScore = 0;
    let dominant = 'neutral';
    for (const [expr, score] of Object.entries(expressions)) {
        if (score > maxScore) {
            maxScore = score;
            dominant = expr;
        }
    }
    return dominant;
}

/**
 * 얼굴 랜드마크를 분석하여 3축(Roll, Yaw, Pitch) 각도가 정상인지 검사합니다.
 * * @param {object} detection - ML5에서 감지된 단일 얼굴 객체
 * @returns {{isBad: boolean, message: string}} 상태 불량 여부와 경고 메시지 객체
 */
function checkFaceAngle(detection) {
    if (!detection || !detection.landmarks) return { isBad: false, message: "" };
    
    // landmarks: 얼굴 특징점 68개
    const lm = detection.landmarks.positions;
    
    // 주요 랜드마크 좌표 추출
    const leftEye = lm[36];     // 왼쪽 끝 (정밀한 계산을 위해)
    const rightEye = lm[45];    // 오른쪽 끝
    const nose = lm[30];        // 코끝
    const mouthY = (lm[48].y + lm[54].y) / 2; // 입 양끝의 Y중앙

    // 기준 거리 (눈 사이 거리) - 얼굴 크기에 따른 정규화를 위해 사용
    const eyeDist = dist(leftEye.x, leftEye.y, rightEye.x, rightEye.y);
    // 눈 사이의 x,y 좌표
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeMidY = (leftEye.y + rightEye.y) / 2;

    // 1. Roll (기울기): 양쪽 눈의 Y 좌표 차이 검사
    // eyeDist로 나누는 이유: 얼굴 크기에 비해 얼마나 기울어졌는지 확인하기 위해
    // (y 좌표의 차이로만 비교하면 카메라와의 거리에 따라 판단되기 때문에 가까우면 조금만 기울어도 수치상 많이 기우린 것으로 판단됨)
    const roll = abs(leftEye.y - rightEye.y) / eyeDist;
    if (roll > CONFIG.thresholds.roll) return { isBad: true, message: "고개를 반듯하게 세워주세요!" };

    // 2. Yaw (좌우 회전): 코가 양 눈의 중심 X좌표에서 얼마나 벗어났는지 검사
    const yaw = abs(nose.x - eyeMidX) / eyeDist;
    if (yaw > CONFIG.thresholds.yaw) return { isBad: true, message: "정면을 봐주세요! (좌우 회전)" };

    // 3. Pitch (상하 끄덕임): (눈~코 거리) 대 (코~입 거리) 비율 검사
    const eyeToNose = abs(nose.y - eyeMidY);
    const noseToMouth = abs(mouthY - nose.y);
    if (noseToMouth === 0) return { isBad: false, message: "" };

    const pitchRatio = eyeToNose / noseToMouth;
    
    // 비율이 너무 작으면 턱을 든 것, 크면 고개를 숙인 것
    if (pitchRatio < CONFIG.thresholds.pitchMin) return { isBad: true, message: "턱을 너무 들었습니다! (아래 보기)" };
    if (pitchRatio > CONFIG.thresholds.pitchMax) return { isBad: true, message: "고개를 너무 숙였습니다! (위 보기)" };

    return { isBad: false, message: "" };
}

// ==========================================
// 6. 게임 로직 & UI (GAME LOGIC)
// ==========================================

/**
 * 실제 게임 플레이 로직을 수행하는 함수
 * 장애물 생성, 이동, 충돌 체크, 플레이어 업데이트를 담당합니다.
 */
function runGame() {
    // 경고 상태면 게임 로직 중단 (플레이어는 표시하되 움직임 제한)
    if (faceAngleWarning) {
        player.setState('neutral');
        player.show();
        return;
    }

    // 장애물 생성 (약 100프레임마다 50% 확률)
    if (frameCount % 100 === 0 && random(1) < 0.5) {
        obstacles.push(new Obstacle());
    }

    // 장애물 업데이트 및 충돌 처리
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.update();
        obs.show();

        if (obs.hits(player)) {
            setGameOver();
        }

        // 화면 밖으로 나간 장애물 제거 및 점수 증가
        if (obs.isOffscreen()) {
            obstacles.splice(i, 1);
            score++;
        }
    }

    // 플레이어 업데이트
    player.setState(currentExpression);
    player.update();
    player.show();

    // UI 표시
    drawGameUI();
}

/** 게임 시작/재시작 시 변수 초기화 */
function startGame() {
    obstacles = [];
    score = 0;
    player.reset();
    currentExpression = 'neutral';
    faceAngleWarning = false;
    gameState = 'playing';
}

/** 게임 오버 상태로 전환 */
function setGameOver() {
    gameState = 'gameOver';
    console.log("GAME OVER");
}

/** 키보드 입력 처리 (엔터키) */
function keyPressed() {
    if (keyCode === ENTER) {
        if (gameState === 'start' || gameState === 'gameOver') {
            startGame();
        }
    }
}

// --- 그리기 헬퍼 함수들 ---

/** 디버깅용 웹캠 화면 그리기 (좌우 반전) */
function drawDebugVideo() {
    push();
    translate(width * CONFIG.videoScale, 0);
    scale(-1, 1);   // 거울모드
    image(video, 0, 0, width * CONFIG.videoScale, height * CONFIG.videoScale);
    pop();  // pop 안하면 웹캠 화면 말고 다른 모든 요소들도 거울모드로 나옴
}

/** 바닥 그리기 */
function drawGround() {
    fill(100);
    noStroke();
    rect(0, groundY, width, height - groundY);
}

/** 게임 중 점수와 상태 텍스트 그리기 */
function drawGameUI() {
    fill(255);
    textSize(30);
    textAlign(RIGHT, TOP);
    text(`Score: ${score}`, width - 20, 20);
    text(`State: ${currentExpression}`, width - 20, 60);
}

/** 얼굴 각도 경고창 그리기 */
function drawWarningOverlay() {
    fill(0, 0, 0, 200);
    rect(0, 0, width, height);

    fill(255, 50, 50);
    textSize(35);
    textAlign(CENTER, CENTER);
    text("⚠️ 각도 주의 ⚠️", width / 2, height / 2 - 50);
    
    fill(255);
    textSize(25);
    text(warningMessage, width / 2, height / 2 + 20);
    
    textSize(18);
    fill(200);
    text("얼굴을 화면 평면과 나란히 해주세요.", width / 2, height / 2 + 60);
}

/** 시작 화면 그리기 */
function drawStartScreen() {
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(50);
    text("Press ENTER to Start", width / 2, height / 2);
}

/** 게임 오버 화면 그리기 */
function drawGameOverScreen() {
    fill(255, 0, 0);
    textAlign(CENTER, CENTER);
    textSize(50);
    text("GAME OVER", width / 2, height / 2 - 40);
    textSize(30);
    text(`Score: ${score}`, width / 2, height / 2 + 20);
    text("Press ENTER to Restart", width / 2, height / 2 + 70);
}

// ==========================================
// 7. 클래스 정의 (CLASSES)
// ==========================================

/**
 * 게임 플레이어(캐릭터) 클래스
 * 표정에 따라 점프하거나 숙이는 동작을 수행합니다.
 */
class Player {
    constructor() {
        this.w = 50;
        this.hNormal = 80;  // 평소
        this.hDuck = 40;    // 숙였을 떄
        this.x = 50;
        this.gravity = 0.8;
        this.jumpForce = -18;
        
        // 초기 상태 설정
        this.reset();
    }

    /** 플레이어 위치 및 상태 초기화 */
    reset() {
        this.y = groundY;
        this.vy = 0;
        this.h = this.hNormal;
        this.state = 'running';
    }

    /**
     * 표정에 따라 플레이어의 상태를 변경합니다.
     * @param {string} expression - 현재 감지된 표정
     */
    setState(expression) {
        // 공중에 있을 때는 상태 변경 불가
        if (!this.isOnGround()) return;

        if (expression === 'happy' || expression === 'surprised') {
            this.jump();
            this.state = 'jumping';
        } else if (['sad', 'angry', 'fearful', 'disgusted'].includes(expression)) {
            this.state = 'ducking';
        } else {
            this.state = 'running';
        }
    }

    /** 점프 수행 (Y축 속도 변경) */
    jump() {
        if (this.isOnGround()) {
            this.vy = this.jumpForce;
        }
    }

    /** 바닥에 닿아있는지 확인 */
    isOnGround() {
        return this.y >= groundY;
    }

    /** 매 프레임 물리 엔진 업데이트 */
    update() {
        // 중력 적용
        this.y += this.vy;
        this.vy += this.gravity;

        // 바닥 충돌 처리
        if (this.y > groundY) {
            this.y = groundY;
            this.vy = 0;
            // 점프가 끝났으면 달리기 상태로 복귀
            if (this.state === 'jumping' && currentExpression !== 'ducking') {
                 this.state = 'running';
            }
        }

        // 상태에 따른 캐릭터 높이 조절 (숙이기 등)
        if (this.state === 'ducking' && this.isOnGround()) {
            this.h = this.hDuck;
        } else {
            this.h = this.hNormal;
        }
    }

    /** 플레이어 그리기 */
    show() {
        fill(0, 150, 255);
        noStroke();
        // 발 위치(y)를 기준으로 높이만큼 위로 그리기
        rect(this.x, this.y - this.h, this.w, this.h);
    }
}

/**
 * 장애물 클래스
 * 랜덤한 높이를 가지며 오른쪽에서 왼쪽으로 이동합니다.
 */
class Obstacle {
    constructor() {
        this.x = width;
        this.w = 40;
        this.speed = 7;
        
        // 50% 확률로 '낮은 장애물(점프해서 피함)' 또는 '높은 장애물(숙여서 피함)' 생성
        if (random(1) > 0.5) {
            this.type = 'low';
            this.h = 60;
            this.y = groundY - this.h; // 바닥에 붙어있음
        } else {
            this.type = 'high';
            this.h = 50;
            this.y = groundY - 100; // 공중에 떠 있음
        }
    }

    /** 위치 업데이트 (왼쪽으로 이동) */
    update() {
        this.x -= this.speed;
    }

    /** 장애물 그리기 */
    show() {
        fill(255, 0, 0);
        noStroke();
        rect(this.x, this.y, this.w, this.h);
    }

    /** 화면 밖으로 나갔는지 확인 */
    isOffscreen() {
        return this.x < -this.w;
    }

    /**
     * 플레이어와의 충돌 감지 (AABB 방식)
     * @param {Player} player - 플레이어 객체
     * @returns {boolean} 충돌 여부
     */
    hits(player) {
        let pLeft = player.x;
        let pRight = player.x + player.w;
        let pTop = player.y - player.h;
        let pBottom = player.y;

        let oLeft = this.x;
        let oRight = this.x + this.w;
        let oTop = this.y;
        let oBottom = this.y + this.h;

        return (pRight > oLeft && pLeft < oRight && pBottom > oTop && pTop < oBottom);
    }
}
