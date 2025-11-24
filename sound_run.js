let audioContext;
let mic;
let pitch;
let audioStarted = false;
let modelLoaded = false;
let currentPitch = 0;
let currentNote = "";

// 게임 변수
let player;
let obstacles = [];
let score = 0;
let gameOver = false;
let gameSpeed = 5;
let obstacleSpawnTimer = 0;
let obstacleSpawnInterval = 90; // 프레임 단위

// 피치 기반 제어
let baselinePitch = 0; // 기준 음정
let pitchHistory = [];
let calibrating = true;
let calibrationTime = 0;
let smoothedPitch = 0; // 스무딩된 피치 값
let pitchSmoothFactor = 0.4; // 스무딩 정도 (0-1, 높을수록 빠른 반응)
let lastValidPitch = 0; // 마지막 유효한 피치
let volumeThreshold = 0.015; // 볼륨 임계값 (낮추면 더 민감)
let calibrationMessage = "편안한 음정으로 소리를 내주세요"; // 캘리브레이션 메시지

function setup() {
  createCanvas(800, 600);
  textAlign(CENTER, CENTER);
  
  // 플레이어 초기화
  player = {
    x: 100,
    y: 400,
    width: 40,
    height: 60,
    velocityY: 0,
    gravity: 0.8,
    jumpForce: 0,
    groundY: 400,
    isDucking: false
  };
  
  // 사용자 제스처 이후에 오디오 시작
  userStartAudio().then(() => {
    console.log("오디오 컨텍스트 시작됨");
  });
}

function draw() {
  background(30);
  
  if (!audioStarted) {
    // 시작 화면
    fill(255);
    textSize(32);
    text("🎵 피치 점프 게임 🎵", width / 2, height / 2 - 100);
    textSize(20);
    text("화면을 클릭하여 시작", width / 2, height / 2);
    textSize(16);
    fill(150);
    text("소리 없음: 일어서기 | 기준 음정: 숙이기 | 높은 음: 점프", width / 2, height / 2 + 50);
    text("더 높은 음 = 더 높은 점프! (세밀한 조절 가능)", width / 2, height / 2 + 80);
  } else if (!modelLoaded) {
    fill(255);
    textSize(24);
    text("피치 감지 모델 로딩 중...", width / 2, height / 2);
  } else if (calibrating) {
    // 캘리브레이션 화면
    fill(255);
    textSize(24);
    text("캘리브레이션 중...", width / 2, height / 2 - 50);
    textSize(16);
    fill(150);
    text(calibrationMessage, width / 2, height / 2);
    text("(3초간 기준 음정을 설정합니다)", width / 2, height / 2 + 30);
    
    // 진행 바
    let progress = calibrationTime / 180;
    let barWidth = 300;
    noFill();
    stroke(100);
    rect(width / 2 - barWidth / 2, height / 2 + 70, barWidth, 20);
    fill(100, 200, 255);
    noStroke();
    rect(width / 2 - barWidth / 2, height / 2 + 70, barWidth * progress, 20);
  } else {
    // 게임 화면
    if (!gameOver) {
      updateGame();
    }
    drawGame();
  }
}

function updateGame() {
  // 점수 증가
  score += 1;
  
  // 게임 속도 증가 (최대 15)
  gameSpeed = min(5 + score / 500, 15);
  
  // 장애물 생성 간격 감소 (최소 40프레임)
  obstacleSpawnInterval = max(90 - score / 200, 40);
  
  // 피치 기반 플레이어 제어
  controlPlayerWithPitch();
  
  // 플레이어 물리
  updatePlayer();
  
  // 장애물 생성
  obstacleSpawnTimer++;
  if (obstacleSpawnTimer > obstacleSpawnInterval) {
    spawnObstacle();
    obstacleSpawnTimer = 0;
  }
  
  // 장애물 업데이트
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= gameSpeed;
    
    // 화면 밖으로 나간 장애물 제거
    if (obstacles[i].x + obstacles[i].width < 0) {
      obstacles.splice(i, 1);
    }
  }
  
  // 충돌 감지
  checkCollision();
}

function controlPlayerWithPitch() {
  if (currentPitch > 0 && baselinePitch > 0) {
    // 피치 스무딩 적용
    smoothedPitch = smoothedPitch * (1 - pitchSmoothFactor) + currentPitch * pitchSmoothFactor;
    
    // [핵심 수정] Hz 차이 대신 Cents(상대 음정) 차이를 계산
    let centsDiff = frequencyToCents(baselinePitch, smoothedPitch);
    
    // 기준 음정 근처 (-150 Cents ~ +200 Cents) -> 숙이기
    // (약 1.5 반음 아래 ~ 2 반음 위)
    if (centsDiff >= -150 && centsDiff < 200) {
      player.isDucking = true;
    } else {
      player.isDucking = false;
    }
    
    // 높은 음 (200 Cents 이상) -> 점프 (지면에 있을 때만)
    // (200 Cents = 2 반음 = 장2도)
    if (centsDiff >= 200 && player.y >= player.groundY - 1) {
      // Cents 차이에 따라 점프력 조절
      // 200~700 Cents 범위를 10~22로 매핑 (700 Cents = 완전 5도)
      let jumpPower = map(centsDiff, 200, 700, 10, 22);
      jumpPower = constrain(jumpPower, 10, 22);
      player.velocityY = -jumpPower;
    }
    
  } else {
    // 소리를 내지 않을 때
    smoothedPitch = smoothedPitch * 0.8; // 천천히 감소
    player.isDucking = false; // 일어서 있기 (기본 자세)
  }
}

function updatePlayer() {
  // 중력 적용
  player.velocityY += player.gravity;
  player.y += player.velocityY;
  
  // 지면 체크
  if (player.y >= player.groundY) {
    player.y = player.groundY;
    player.velocityY = 0;
  }
  
  // 높이 제한
  if (player.y < 50) {
    player.y = 50;
    player.velocityY = 0;
  }
}

function spawnObstacle() {
  let obstacleType = random() > 0.5 ? 'ground' : 'air';
  
  let obstacle;
  if (obstacleType === 'ground') {
    // 지상 장애물 (숙여서 피하거나 점프로 피함)
    obstacle = {
      x: width,
      y: player.groundY,
      width: 30,
      height: random() > 0.5 ? 50 : 80, // 높이 랜덤
      type: 'ground',
      color: color(255, 100, 100)
    };
  } else {
    // 공중 장애물 (높게 점프해야 피함)
    obstacle = {
      x: width,
      y: player.groundY - random(30, 40),
      width: 40,
      height: 30,
      type: 'air',
      color: color(255, 200, 100)
    };
  }
  
  obstacles.push(obstacle);
}

function checkCollision() {
  for (let obstacle of obstacles) {
    let playerWidth = player.isDucking ? player.width : player.width;
    let playerHeight = player.isDucking ? player.height / 2 : player.height;
    let playerY = player.isDucking ? player.y + player.height / 2 : player.y;
    
    if (player.x < obstacle.x + obstacle.width &&
        player.x + playerWidth > obstacle.x &&
        playerY < obstacle.y + obstacle.height &&
        playerY + playerHeight > obstacle.y) {
      gameOver = true;
    }
  }
}

function drawGame() {
  // 배경 - 지면
  stroke(100);
  strokeWeight(2);
  line(0, player.groundY + player.height, width, player.groundY + player.height);
  
  // 플레이어 그리기
  drawPlayer();
  
  // 장애물 그리기
  for (let obstacle of obstacles) {
    fill(obstacle.color);
    noStroke();
    rect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 5);
  }
  
  // UI
  drawUI();
  
  // 게임 오버 화면
  if (gameOver) {
    fill(0, 0, 0, 200);
    rect(0, 0, width, height);
    
    fill(255);
    textSize(48);
    text("게임 오버!", width / 2, height / 2 - 50);
    textSize(32);
    text("점수: " + floor(score / 60), width / 2, height / 2 + 20);
    textSize(20);
    fill(150);
    text("R 키를 눌러 재시작", width / 2, height / 2 + 80);
  }
}

function drawPlayer() {
  push();
  translate(player.x, player.y);
  
  if (player.isDucking) {
    // 숙인 모습
    fill(100, 200, 255);
    noStroke();
    ellipse(player.width / 2, player.height / 2 + 20, player.width * 1.2, player.height / 2);
    
    // 눈
    fill(0);
    circle(player.width / 2 - 8, player.height / 2 + 15, 5);
    circle(player.width / 2 + 8, player.height / 2 + 15, 5);
  } else {
    // 일반 모습
    fill(100, 200, 255);
    noStroke();
    rect(0, 0, player.width, player.height, 10);
    
    // 얼굴
    fill(0);
    circle(player.width / 2 - 8, player.height / 3, 5);
    circle(player.width / 2 + 8, player.height / 3, 5);
    
    // 입
    noFill();
    stroke(0);
    strokeWeight(2);
    arc(player.width / 2, player.height / 2, 15, 10, 0, PI);
  }
  
  pop();
}

function drawUI() {
  // 점수
  fill(255);
  noStroke();
  textSize(24);
  textAlign(LEFT, TOP);
  text("점수: " + floor(score / 60), 20, 20);
  text("속도: " + gameSpeed.toFixed(1), 20, 50);
  
  // 현재 음정 표시
  textSize(16);
  fill(150);
  if (currentNote && currentPitch > 0 && baselinePitch > 0) {
    text("현재 음정: " + currentNote + " (" + currentPitch.toFixed(0) + " Hz)", 20, 80);
    
    // [수정] Cents 차이 표시
    let centsDiff = frequencyToCents(baselinePitch, smoothedPitch);
    text("차이: " + centsDiff.toFixed(0) + " Cents", 20, 100);
    
    if (centsDiff >= -150 && centsDiff < 200) {
      fill(255, 200, 100);
      text("↓ 숙이기", 20, 125);
    } else if (centsDiff >= 200) {
      fill(100, 255, 100);
      let jumpPowerDisplay = map(centsDiff, 200, 700, 10, 22);
      jumpPowerDisplay = constrain(jumpPowerDisplay, 10, 22);
      text("↑ 점프! (파워: " + jumpPowerDisplay.toFixed(1) + ")", 20, 125);
    } else {
      fill(150, 150, 255);
      text("→ 일어서기", 20, 125);
    }
    
  } else if (currentPitch > 0) {
     text("현재 음정: " + currentNote + " (" + currentPitch.toFixed(0) + " Hz)", 20, 80);
  } else {
    // 소리가 없을 때
    fill(150);
    textSize(16);
    text("소리 감지 안됨 - 일어서 있기", 20, 80);
  }
  
  // 기준 음정
  if (baselinePitch > 0) {
    fill(100);
    textSize(14);
    // [수정] 기준 음의 노트 이름도 표시
    text("기준: " + frequencyToNote(baselinePitch) + " (" + baselinePitch.toFixed(0) + " Hz)", 20, 150);
  }
  
  // [추가] 재보정 안내
  textSize(14);
  fill(100);
  text("'C' 키: 재보정", 20, 170);
  
  textAlign(CENTER, CENTER);
}

function mousePressed() {
  if (!audioStarted) {
    console.log("마이크 시작 중...");
    
    // 마이크 시작
    mic = new p5.AudioIn();
    mic.start(() => {
      console.log("✓ 마이크 시작됨");
      audioStarted = true;
      
      // 오디오 컨텍스트 가져오기
      audioContext = getAudioContext();
      console.log("✓ 오디오 컨텍스트:", audioContext);
      
      // ml5 피치 감지 모델 로드 (로컬 모델 경로 사용)
      if (typeof ml5 !== 'undefined') {
        console.log("✓ ml5 로드됨, 버전:", ml5.version);
        console.log("CREPE 모델 로딩 시작...");
        
        try {
          pitch = ml5.pitchDetection('./audio_models/crepe/', audioContext, mic.stream, modelReady);
        } catch (err) {
          console.error("❌ 모델 로드 에러:", err);
        }
      } else {
        console.error("❌ ml5가 로드되지 않았습니다");
      }
    }, (err) => {
      console.error("❌ 마이크 시작 에러:", err);
    });
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    if (gameOver) {
      resetGame();
    }
  }
  
  // [추가] 'C' 키로 언제든지 캘리브레이션 다시 시작
  if (key === 'c' || key === 'C') {
    startCalibration();
  }
}

function resetGame() {
  obstacles = [];
  score = 0;
  gameOver = false;
  gameSpeed = 5;
  obstacleSpawnTimer = 0;
  player.y = player.groundY;
  player.velocityY = 0;
  player.isDucking = false; // 기본 자세: 일어서 있기
  smoothedPitch = 0; // 스무딩된 피치도 리셋
  lastValidPitch = 0; // 마지막 유효 피치도 리셋
}

function modelReady() {
  console.log("✓ 피치 감지 모델 로드 완료!");
  modelLoaded = true;
  getPitch();
}

function getPitch() {
  if (pitch && modelLoaded) {
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
          lastValidPitch = frequency; // [수정] 유효할 때만 lastValidPitch 업데이트
          
          if (calibrating) {
            pitchHistory.push(frequency);
            calibrationTime++;
            
            if (calibrationTime >= 180) {
              // [수정] 캘리브레이션 견고성 강화
              if (pitchHistory.length > 50) { // 3초 중 최소 50프레임 유효한 소리가 있었는지 확인
                baselinePitch = pitchHistory.reduce((a, b) => a + b) / pitchHistory.length;
                console.log("기준 음정 설정:", baselinePitch.toFixed(2), "Hz");
                calibrating = false;
                pitchHistory = [];
              } else {
                // 유효한 소리가 충분하지 않으면 캘리브레이션 리셋
                console.log("캘리브레이션 실패: 소리가 충분하지 않습니다. 재시도...");
                calibrationTime = 0;
                pitchHistory = [];
                calibrationMessage = "소리가 감지되지 않았습니다. 다시 시도합니다.";
              }
            }
          }
        }
      } else if (level <= volumeThreshold) {
        // [수정] 소리가 없으면 currentPitch만 0으로 (캐릭터를 세우기 위해)
        // lastValidPitch는 0으로 만들지 않아야 필터가 정상 동작함
        currentPitch = 0;
        currentNote = "";
      }
      
      getPitch();
    });
  }
}

// [신규 추가] 주파수(Hz)를 두 음 사이의 Cents 차이로 변환
function frequencyToCents(freq1, freq2) {
  if (!freq1 || !freq2) return 0; // 0으로 나누기 방지
  return 1200 * Math.log2(freq2 / freq1);
}

// [신규 추가] 캘리브레이션 초기화 함수
function startCalibration() {
  calibrating = true;
  calibrationTime = 0;
  pitchHistory = [];
  baselinePitch = 0;
  smoothedPitch = 0;
  lastValidPitch = 0;
  calibrationMessage = "편안한 음정으로 소리를 내주세요";
  console.log("캘리브레이션 시작...");
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
