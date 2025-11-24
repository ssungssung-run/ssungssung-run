// ===================== FILE STRUCTURE =====================
// 1. 전역 상수 / 전역 변수
// 2. p5 기본 함수: preload, setup, windowResized, centerCanvas, draw, keyPressed
// 3. 게임 상태 화면: drawIntroScreen(2개), drawGameOverScreen, showGameOver
// 4. 배경 & 바다 & 파도: drawWebcamBackground, drawWater,
//    drawWaveLayer, drawWaveImage, drawWavesBehindPillars, drawWavesInFrontOfPillars
// 5. 점수 UI: drawScore
// 6. 플레이어: drawPlayer
// 7. 발판 & 기둥 & 초기화: initGame, placePlayerOnFirstPlatform,
//    drawPlatforms, drawSpikes, updateInfinitePlatforms
// 8. 물리 / 충돌 / 패배 판정: applyPlatformCollision, checkFallingIntoWater
// =========================================================



// ===================== 1. GLOBAL CONSTANTS / VARIABLES =====================
let canvas;
const GAME_W = 520;     // 가로 폭
let GAME_H;             // 세로는 창 높이(windowHeight) 사용

// 인트로 / 게임 상태
let gameState = "intro"; // "intro" | "playing" | "gameover"
let startTime = 0;
let score = 0;
let bestScore = 0;

let introFontSize = 40;
let introBlinkTimer = 0;

// 웹캠
let cam;

// 이미지
let imgIdle;   // 캐릭터 정지
let imgJump;   // 캐릭터 점프 / 움직임
let wave1, wave2, wave3, wave4;

// 물리/게임 변수
let gravity    = 0.7;
let jumpPower  = -15;
let moveSpeed  = 6;

let worldOffset = 0;    // 배경이 이동한 양
let worldSpeed  = 0;

const WATER_RATIO = 0.83; // 화면 높이 중 바다 시작 비율
let waterLevel;

// 발판이 위치할 수 있는 세로 범위 (비율 기준)
const PLATFORM_MIN_Y_RATIO = 0.35;
const PLATFORM_MAX_Y_RATIO = 0.6;

// 이전 발판과의 최대 높이 차이 (픽셀 단위, 필요하면 조절)
const PLATFORM_MAX_DELTA_Y = 80;

// 발판 폭 설정 (일반/얇은 발판)
const PLATFORM_W_NORMAL_MIN = 150;
const PLATFORM_W_NORMAL_MAX = 230;

const PLATFORM_W_THIN_MIN   = 60;
const PLATFORM_W_THIN_MAX   = 90;

// 얇은 발판이 나올 확률 (0~1 사이). 0.3 = 30%
const THIN_PLATFORM_PROB = 0.3;

// 캐릭터 정보
let player = {
  baseX: 160,     // 화면에서 거의 고정되는 x 위치
  x: 160,
  y: 0,
  vy: 0,
  size: 85,       // 충돌 박스 크기
  onGround: false,
  isDead: false
};

// 발판 배열
let platforms = [];

let waveOffset = 0;



// ===================== 2. P5 LIFECYCLE (preload / setup / draw / ...) =====================

// 이미지 로드 
function preload() {
  introBg = loadImage("images/intro_bg.png");
  logoImg = loadImage("images/logo.png"); 
  imgIdle = loadImage("images/슝슝이.png");    // 서 있는 이미지
  imgJump = loadImage("images/슝슝이J.png");  // 점프/이동 이미지
  wave1 = loadImage("images/wave1.png");      // 하얀
  wave2 = loadImage("images/wave2.png");      // 연파랑
  wave3 = loadImage("images/wave3.png");      // 파랑
  wave4 = loadImage("images/wave4.png");      // 진파랑
}

// ===================== setup =====================
function setup() {
  GAME_H = windowHeight;               // 세로 전체 사용
  canvas = createCanvas(GAME_W, GAME_H);
  centerCanvas();

  waterLevel = GAME_H * WATER_RATIO;

  // 웹캠 설정 (비율은 원본 그대로, 나중에 그릴 때 크롭)
  cam = createCapture(VIDEO);
  cam.hide();
  cam.elt.setAttribute("playsinline", "");

  initGame();
}

function windowResized() {
  GAME_H = windowHeight;
  resizeCanvas(GAME_W, GAME_H);
  centerCanvas();
  waterLevel = GAME_H * WATER_RATIO;
}

// 캔버스를 화면 가운데(가로만) 위치시키기
function centerCanvas() {
  const x = (windowWidth - GAME_W) / 2;
  const y = 0;
  canvas.position(x, y);
}

// ===================== 메인 루프 =====================
function draw() {
  // 1) 웹캠 배경 항상 먼저
  drawWebcamBackground();

  // 상태에 따라 분기
  if (gameState === "intro") {
    // 인트로 화면일 때는 배경만 보여주고 안내 텍스트만 그린 뒤 종료
    drawIntroScreen();
    return;
  }

  if (gameState === "playing") {
    score = floor((millis() - startTime) / 1000); // 초 단위
  }  

  // 2) 배경 이동 (playing 상태에서만 움직이게)
  if (gameState === "playing") {
    if (keyIsDown(RIGHT_ARROW) || keyIsDown(UP_ARROW)) {
      worldSpeed = moveSpeed;
    } else {
      worldSpeed = 0;
    }
    worldOffset += worldSpeed;
  } else {
    // gameover일 때는 배경 멈춤
    worldSpeed = 0;
  }

  // 3) 무한 발판 생성 (위치는 계속 유지)
  updateInfinitePlatforms();

  // 4) 파도 (기둥 뒤쪽)
  drawWavesBehindPillars();

  // 5) 발판 + 기둥 (스크롤 적용)
  push();
  translate(-worldOffset, 0);
  drawPlatforms();
  pop();

  // 6) 파도 (기둥 앞쪽)
  drawWavesInFrontOfPillars();

  // 7) 캐릭터 물리 업데이트 (playing에서만)
  if (gameState === "playing") {
    player.vy += gravity;
    player.y  += player.vy;
    player.onGround = false;

    applyPlatformCollision();
    checkFallingIntoWater();  // 여기서 죽으면 gameState 바꿀 거야
  }

  // 8) 캐릭터 그리기
  drawPlayer();

  // 9) 파도 애니메이션
  waveOffset += 0.8;

  if (gameState === "playing") {
    drawScore();
  }
  
  // 10) 게임 오버 상태일 때 오버레이
  if (gameState === "gameover") {
    showGameOver();
  }

  if (gameState === "gameover") {
    bestScore = max(bestScore, score);
  }
}

// ===================== 입력 처리 =====================
function keyPressed() {
  // 1) 인트로 상태에서: 스페이스 or Enter 누르면 게임 시작
  if (gameState === "intro") {
    if (key === ' ' || keyCode === ENTER) {
      initGame();            // 발판/플레이어 위치 리셋
      player.isDead = false;
      gameState = "playing"; // 플레이 상태로 전환
    }
    return; // intro일 땐 여기서 끝
  }

  if (gameState === "intro") {
    if (key === " ") {
      initGame();
      score = 0;
      startTime = millis();     // 시간 재기 시작
      gameState = "playing";
    }
    return;
  }
  
  // 2) 플레이 상태에서: 점프 입력만 처리
  if (gameState === "playing") {
    if (keyCode === UP_ARROW && player.onGround && !player.isDead) {
      player.vy = jumpPower;
      player.onGround = false;
    }
    return;
  }

  // 3) 게임오버 상태에서: 스페이스 누르면 재시작
  if (gameState === "gameover") {
    if (key === " ") {
      initGame();
      startTime = millis();
      score = 0;
      gameState = "playing";
    }
    return;
  }
}



// ===================== 3. GAME SCREENS (INTRO / GAME OVER) =====================

// 아웃트로 (점수 포함 화면)
function drawGameOverScreen() {
  fill(0, 180);
  rect(0, 0, GAME_W, GAME_H);

  textAlign(CENTER, CENTER);
  fill(255);

  textSize(50);
  text("GAME OVER", GAME_W/2, GAME_H/2 - 80);

  textSize(24);
  text("Your Time: " + score + "s", GAME_W/2, GAME_H/2 - 20);
  text("Best Time: " + bestScore + "s", GAME_W/2, GAME_H/2 + 20);

  if (frameCount % 60 < 30) {
    text("Press SPACE to Restart", GAME_W/2, GAME_H/2 + 80);
  }
}

// 인트로 (현재 실제로 사용되는 정의)
function drawIntroScreen() {

  image(introBg, 0, 0, GAME_W, GAME_H);

  image(logoImg, GAME_W / 40 , GAME_H / 2 - 300, 500, 200); //로고

  // 글자
  fill(255);
  textAlign(CENTER, CENTER);

  textSize(40);
  text("CHICKEN SCREAM (DEMO)", GAME_W / 2, GAME_H / 2 - 40);

  textSize(20);
  text("↑ 점프   → 앞으로 이동", GAME_W / 2, GAME_H / 2 + 5);
  text("스페이스바를 눌러 시작", GAME_W / 2, GAME_H / 2 + 40);

  pop();
}

function showGameOver() {
  fill(0, 150);
  rect(0, 0, width, height);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(32);
  text("GAME OVER", width / 2, height / 2 - 20);
  textSize(18);
  text("스페이스바를 눌러 다시 시작", width / 2, height / 2 + 20);
}



// ===================== 4. BACKGROUND / WATER / WAVES =====================

// 웹캠 배경 (비율 유지 + 크롭 + 좌우 반전)
function drawWebcamBackground() {
  if (!cam || cam.width === 0 || cam.height === 0) {
    background(0); // 웹캠 준비 전에는 그냥 검은 화면
    return;
  }

  const vidW = cam.width;
  const vidH = cam.height;

  const scaleFactor = max(width / vidW, height / vidH);

  push();
  translate(width / 2, height / 2);
  scale(-scaleFactor, scaleFactor); // 좌우 반전 + 확대
  imageMode(CENTER);
  image(cam, 0, 0);
  pop();
}

function drawWater() {
  noStroke();
  fill(0, 60, 160);
  rect(0, waterLevel, width, height - waterLevel);

  fill(255);
  for (let i = 0; i < width; i += 40) {
    ellipse(i + 20, waterLevel, 40, 20);
  }
}

function drawWaveLayer(y, radius, color, speed, offset) {
  fill(color);
  noStroke();

  const diameter = radius * 2;
  
  for (let x = offset; x < GAME_W + diameter; x += diameter) {
    ellipse(x, y, diameter, diameter);
  }
}

function drawWaveImage(img, y, h, speed) {
  let offset = (waveOffset * speed) % width;

  // 왼쪽/오른쪽 두 번 그려서 끊김 없는 반복 파도
  image(img, -offset, y, width, h);
  image(img, width - offset, y, width, h);
}

function drawWavesBehindPillars() {
  const h = 150;               // 파도 높이
  const bottom = GAME_H;       // 화면 맨 아래 기준

  drawWaveImage(wave1, bottom - h - 50, h, 0.4);  // 하얀
  drawWaveImage(wave2, bottom - h - 30, h, 0.6);  // 연파랑
}

function drawWavesInFrontOfPillars() {
  const h = 160;
  const bottom = GAME_H;

  drawWaveImage(wave3, bottom - h - 10, h, 0.8);   // 파랑
  drawWaveImage(wave4, bottom - h, h, 1.1);        // 진파랑
}



// ===================== 5. SCORE UI =====================
function drawScore() {
  fill(255);
  textSize(30);
  textAlign(LEFT, TOP);
  text("Time: " + score + "s", 20, 20);
}



// ===================== 6. PLAYER RENDERING =====================
function drawPlayer() {
  // 배경이 움직일 때 살짝 흔들리는 효과
  let wiggle = (worldSpeed !== 0 && !player.isDead)
    ? sin(frameCount * 0.3) * 3
    : 0;

  player.x = player.baseX + wiggle;

  // 어떤 이미지 쓸지 상태에 따라 고르기
  let currentImg;
  if (!player.onGround) {
    currentImg = imgJump;           // 공중 → 점프 이미지
  } else if (worldSpeed !== 0) {
    currentImg = imgJump;           // 땅 위 + 움직이는 중
  } else {
    currentImg = imgIdle;           // 땅 위 + 가만히
  }

  const IMG_W = player.size * 1.6;
  const IMG_H = player.size * 1.8;

  push();
  translate(player.x, player.y);
  scale(-1, 1);
  imageMode(CENTER);
  image(currentImg, 0, 0, IMG_W, IMG_H);
  pop();
}



// ===================== 7. PLATFORMS / PILLARS / INITIALIZATION =====================

// 게임 초기화
function initGame() {
  worldOffset = 0;
  worldSpeed  = 0;
  player.vy   = 0;
  player.isDead   = false;
  player.onGround = false;

  const minY = GAME_H * PLATFORM_MIN_Y_RATIO;
  const maxY = GAME_H * PLATFORM_MAX_Y_RATIO;

  platforms = [];
  let x = 0;

  // 첫 번째 발판 y는 자유롭게
  let prevY = random(minY, maxY);

  for (let i = 0; i < 3; i++) {
    // 발판 폭: 가끔은 얇게, 가끔은 보통으로
    let w;
    if (random() < THIN_PLATFORM_PROB) {
      w = random(PLATFORM_W_THIN_MIN, PLATFORM_W_THIN_MAX);    // 얇은 발판
    } else {
      w = random(PLATFORM_W_NORMAL_MIN, PLATFORM_W_NORMAL_MAX); // 일반 발판
      }

    // y는 기존 로직 유지
    let targetY = random(minY, maxY);
    let y = constrain(
      targetY,
      prevY - PLATFORM_MAX_DELTA_Y,
      prevY + PLATFORM_MAX_DELTA_Y
    );
    y = constrain(y, minY, maxY);

    const h = 40;
    platforms.push({ x, y, w, h });
    prevY = y;

    // 얇은 발판일수록 gap도 조금 줄여서 너무 어렵지 않게
    let gap;
    if (w <= PLATFORM_W_THIN_MAX) {
      gap = random(80, 130);     // 얇은 발판 뒤
    } else {
      gap = random(130, 200);    // 일반 발판 뒤
    }

    x += w + gap;
  }

  // 첫 번째 발판 중심에 캐릭터 세우기
  placePlayerOnFirstPlatform();
}

// 첫 번째 발판 중앙에 캐릭터 위치 조정
function placePlayerOnFirstPlatform() {
  if (platforms.length === 0) return;
  const first = platforms[0];

  const topY = first.y - first.h;
  const half = player.size / 2;

  player.y = topY - half;
  player.vy = 0;
  player.onGround = true;

  // 발판 중앙이 player.baseX에 오도록 전체 발판을 평행 이동
  const desiredCenter = player.baseX;
  const currentCenter = first.x + first.w / 2;
  const dx = currentCenter - desiredCenter;

  for (let p of platforms) {
    p.x -= dx;
  }
}

function drawPlatforms() {
  noStroke();

  const darkGreen  = color(42, 135, 64);  // 진한 초록
  const lightGreen = color(72, 170, 92);  // 밝은 초록
  const brown      = color(186, 129, 74); // 기둥 갈색

  for (let p of platforms) {
    const grassTop    = p.y - p.h;  // 발판 윗면(y)
    const grassBottom = p.y;        // 초록 부분이 끝나는 선

    // [기둥] 발판보다 양옆이 더 짧게
    const pillarW = p.w * 0.7;
    const pillarX = p.x + (p.w - pillarW) / 2;

    fill(brown);
    rect(pillarX, grassBottom, pillarW, GAME_H - grassBottom, 0, 0, 20, 20);

    // [발판 1] 진한 초록 둥근 직사각형
    fill(darkGreen);
    rect(p.x, grassTop, p.w, p.h, 20, 20, 0, 0);

    // [발판 2] 1번 직사각형 하단에 붙는 뾰족 (같은 색, 살짝 겹치게)
    const spikeH1 = 10;
    const baseY1  = grassBottom - 0.5;  // -0.5로 살짝 위로 겹쳐서 틈 제거
    drawSpikes(p.x, p.w, baseY1, spikeH1, darkGreen);

    // [발판 3] 위에 덮는 밝은 초록 둥근 직사각형 (더 얇게)
    const overlayH = p.h * 0.7;
    fill(lightGreen);
    rect(p.x, grassTop, p.w, overlayH, 20, 20, 0, 0);

    // [발판 4] 3번 직사각형 하단에 붙는 뾰족 (밝은 초록, 3번과 한 덩어리처럼)
    const spikeH2 = 10;
    const baseY2  = grassTop + overlayH - 0.5;  // 살짝 겹쳐서 틈 없애기
    drawSpikes(p.x, p.w, baseY2, spikeH2, lightGreen);
  }
}

// x: 시작 x, w: 전체 폭, baseY: 윗선 y, h: 아래로 내려가는 높이, col: 색
function drawSpikes(x, w, baseY, h, col) {
  fill(col);

  const approxW = 14; // 대략 목표 톱니 폭
  const n = Math.max(1, Math.round(w / approxW)); // 개수
  const step = w / n; // 실제 폭 (딱 나눠지게)

  beginShape();
  vertex(x, baseY);

  for (let i = 0; i < n; i++) {
    const left  = x + i * step;
    const right = x + (i + 1) * step;
    const mid   = (left + right) / 2;

    vertex(mid, baseY + h); // 아래 꼭짓점
    vertex(right, baseY);   // 다시 윗선으로
  }

  vertex(x + w, baseY);
  endShape(CLOSE);
}

// 무한 발판 / 스크롤
function updateInfinitePlatforms() {
  const minY = GAME_H * PLATFORM_MIN_Y_RATIO;
  const maxY = GAME_H * PLATFORM_MAX_Y_RATIO;

  // 1) 너무 왼쪽으로 멀리 나간 발판 정리
  platforms = platforms.filter(p => (p.x + p.w - worldOffset) > -GAME_W * 0.5);

  // 2) 현재 남아 있는 발판들 중 가장 오른쪽 끝 찾기
  let farthestX = -Infinity;
  let prevY = (minY + maxY) / 2;

  for (let p of platforms) {
    const right = p.x + p.w;
    if (right > farthestX) {
      farthestX = right;
      prevY = p.y; // 마지막 발판의 y 저장 (높이 변화 제한용)
    }
  }

  // 만약 발판이 하나도 없다면 초기값 세팅
  if (!isFinite(farthestX)) {
    farthestX = 0;
    prevY = random(minY, maxY);
  }

  // 3) 화면 오른쪽이 비지 않도록 새 발판 계속 생성
  while (farthestX - worldOffset < GAME_W * 2) {

    // --- 폭: 얇은 발판 / 일반 발판 섞어서 생성 ---
    let newW;
    if (random() < THIN_PLATFORM_PROB) {
      newW = random(PLATFORM_W_THIN_MIN, PLATFORM_W_THIN_MAX);  // 얇은 발판
    } else {
      newW = random(PLATFORM_W_NORMAL_MIN, PLATFORM_W_NORMAL_MAX); // 일반 발판
    }

    // --- 높이: 이전 발판과 너무 차이 나지 않도록 제한 ---
    let targetY = random(minY, maxY);
    let newY = constrain(
      targetY,
      prevY - PLATFORM_MAX_DELTA_Y,
      prevY + PLATFORM_MAX_DELTA_Y
    );
    newY = constrain(newY, minY, maxY);

    // --- 간격: 얇은 발판일수록 gap을 조금 줄여서 난이도 조절 ---
    let newGap;
    if (newW <= PLATFORM_W_THIN_MAX) {
      newGap = random(80, 130);      // 얇은 발판 뒤
    } else {
      newGap = random(130, 200);     // 일반 발판 뒤
    }

    // 새 발판 생성
    const newPlatform = {
      x: farthestX + newGap,
      y: newY,
      w: newW,
      h: 40            // 윗판 두께 (충돌·그리기에서 동일하게 사용)
    };

    platforms.push(newPlatform);
    farthestX = newPlatform.x + newPlatform.w;
    prevY = newY;
  }
}



// ===================== 8. PHYSICS / COLLISION / DEATH =====================
function applyPlatformCollision() {
  const pxWorld = player.x + worldOffset;     // 스크롤 포함한 실제 x

  // 캐릭터 중심이 player.y 라고 가정
  const halfH      = player.size * 0.5;
  const footY      = player.y + halfH;       // 이번 프레임 발 위치(아래쪽)
  const prevFootY  = footY - player.vy;      // 직전 프레임 발 위치

  player.onGround = false;

  for (let p of platforms) {
    const left   = p.x;
    const right  = p.x + p.w;
    const top    = p.y - p.h;  // 발판 윗면

    // x 범위 안에 있을 때만 검사
    if (pxWorld > left && pxWorld < right) {
      // 위에서 내려오고 있고, 지난 프레임엔 발판 위였고
      // 이번 프레임엔 발판 아래로 뚫고 내려간 경우 → 착지로 간주
      if (player.vy >= 0 && prevFootY <= top && footY >= top) {
        // 캐릭터 발이 정확히 발판 위에 오도록 y 조정
        player.y  = top - halfH;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }
}

function checkFallingIntoWater() {
  const halfH = player.size * 0.5;
  const footY = player.y + halfH;   // 발 위치

  if (footY > GAME_H + 40) {
    player.isDead = true;
    gameState = "gameover";   // 상태 전환
  }
}
