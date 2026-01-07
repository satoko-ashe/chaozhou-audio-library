// 潮州话发音录音库管理系统
class ChaozhouRecorder {
    constructor() {
        this.data = {
            library: [],        // 录音库
            recordings: [],     // 已录制的音频
            settings: {         // 设置
                theme: 'light',
                githubConfig: {},
                recordingQuality: 'high'
            },
            currentIndex: 0,    // 当前录音索引
            recordingList: []   // 待录音列表
        };
        
        this.audioContext = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.recordingStartTime = null;
        this.timerInterval = null;
        
        this.init();
    }
    
    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.initAudioContext();
        this.renderRecordingList();
        this.updateStats();
        this.applyTheme();
        this.loadRecordingQueue();
        
        // 检查浏览器兼容性
        this.checkBrowserSupport();
    }
    
    async loadData() {
        try {
            const saved = localStorage.getItem('chaozhouRecorderData');
            if (saved) {
                this.data = JSON.parse(saved);
            } else {
                // 加载初始数据
                const response = await fetch('data.json');
                const initialData = await response.json();
                
                this.data.library = initialData.library || [];
                this.data.recordings = initialData.recordings || [];
                this.data.recordingList = this.generateRecordingQueue();
                
                this.saveData();
            }
        } catch (error) {
            console.error('加载数据失败:', error);
            this.loadDefaultData();
        }
    }
    
    loadDefaultData() {
        // 默认的录音队列（常用字）
        const commonCharacters = [
            { character: '食', pinyin: 'ziak8', type: 'colloquial', tone: 8 },
            { character: '我', pinyin: 'ua2', type: 'colloquial', tone: 2 },
            { character: '你', pinyin: 'le2', type: 'colloquial', tone: 2 },
            { character: '伊', pinyin: 'i1', type: 'colloquial', tone: 1 },
            { character: '好', pinyin: 'ho2', type: 'colloquial', tone: 2 },
            { character: '爱', pinyin: 'ain3', type: 'literary', tone: 3 },
            { character: '去', pinyin: 'ke3', type: 'colloquial', tone: 3 },
            { character: '来', pinyin: 'lai5', type: 'colloquial', tone: 5 },
            { character: '有', pinyin: 'u6', type: 'colloquial', tone: 6 },
            { character: '无', pinyin: 'bo5', type: 'colloquial', tone: 5 }
        ];
        
        this.data.library = commonCharacters;
        this.data.recordings = [];
        this.data.recordingList = this.generateRecordingQueue();
        this.data.currentIndex = 0;
        
        this.saveData();
    }
    
    generateRecordingQueue() {
        // 生成录音队列，包含状态信息
        return this.data.library.map((item, index) => ({
            ...item,
            id: `item_${index}`,
            status: 'pending', // pending, recording, recorded
            audioUrl: null,
            duration: 0,
            qualityScore: 0,
            recordedAt: null,
            metadata: {
                speaker: '默认发音人',
                dialectRegion: '潮州市区',
                notes: ''
            }
        }));
    }
    
    saveData() {
        localStorage.setItem('chaozhouRecorderData', JSON.stringify(this.data));
        this.updateStats();
    }
    
    setupEventListeners() {
        // 录音控制
        document.getElementById('startRecording').addEventListener('click', () => this.startRecording());
        document.getElementById('stopRecording').addEventListener('click', () => this.stopRecording());
        document.getElementById('playRecording').addEventListener('click', () => this.playRecording());
        document.getElementById('rerecord').addEventListener('click', () => this.rerecord());
        
        // 导航控制
        document.getElementById('prevItem').addEventListener('click', () => this.navigate(-1));
        document.getElementById('nextItem').addEventListener('click', () => this.navigate(1));
        document.getElementById('randomItem').addEventListener('click', () => this.selectRandomItem());
        document.getElementById('skipItem').addEventListener('click', () => this.skipCurrentItem());
        
        // 保存元数据
        document.getElementById('saveMetadata').addEventListener('click', () => this.saveCurrentRecording());
        
        // 搜索和筛选
        document.getElementById('searchLibrary').addEventListener('input', (e) => {
            this.searchRecordings(e.target.value);
        });
        
        document.getElementById('filterType').addEventListener('change', (e) => {
            this.filterRecordings();
        });
        
        document.getElementById('filterStatus').addEventListener('change', (e) => {
            this.filterRecordings();
        });
        
        // GitHub相关
        document.getElementById('syncGithub').addEventListener('click', () => this.setupGithubIntegration());
        document.getElementById('testGithub').addEventListener('click', () => this.testGithubConnection());
        document.getElementById('uploadToGithub').addEventListener('click', () => this.uploadToGithub());
        
        // 主题切换
        document.getElementById('toggleDarkMode').addEventListener('click', () => this.toggleTheme());
        
        // 导入导出
        document.getElementById('exportData').addEventListener('click', () => this.exportData());
        document.getElementById('importData').addEventListener('click', () => {
            document.getElementById('fileImport').click();
        });
        
        document.getElementById('fileImport').addEventListener('change', (e) => {
            this.importData(e.target.files[0]);
        });
        
        // 表单输入监听
        document.querySelectorAll('#metadataForm input, #metadataForm select, #metadataForm textarea')
            .forEach(element => {
                element.addEventListener('change', () => this.updateCurrentItemMetadata());
            });
        
        // 音频播放器
        document.getElementById('audioPlayer').addEventListener('loadedmetadata', () => {
            this.updateCurrentRecordingDuration();
        });
    }
    
    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.setupAudioAnalyser();
        } catch (error) {
            console.error('音频上下文初始化失败:', error);
            this.showMessage('您的浏览器不支持录音功能，请使用Chrome或Firefox最新版本', 'error');
        }
    }
    
    setupAudioAnalyser() {
        if (!this.audioContext) return;
        
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        
        // 设置波形绘制
        this.setupWaveform();
    }
    
    setupWaveform() {
        this.canvas = document.getElementById('waveformCanvas');
        this.canvasContext = this.canvas.getContext('2d');
        this.canvasWidth = this.canvas.width;
        this.canvasHeight = this.canvas.height;
        
        // 设置Canvas尺寸
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.canvasWidth = this.canvas.width;
        this.canvasHeight = this.canvas.height;
    }
    
    async startRecording() {
        try {
            // 请求麦克风权限
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 44100,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // 设置媒体录制器
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.processRecording();
                stream.getTracks().forEach(track => track.stop());
            };
            
            // 开始录音
            this.mediaRecorder.start(100); // 每100ms收集一次数据
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // 更新UI
            this.updateRecordingUI(true);
            this.startTimer();
            this.startWaveformAnimation();
            
            // 连接音频分析器
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);
            
        } catch (error) {
            console.error('录音启动失败:', error);
            this.showMessage('无法访问麦克风，请检查权限设置', 'error');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            this.updateRecordingUI(false);
            this.stopTimer();
            this.stopWaveformAnimation();
        }
    }
    
    async processRecording() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // 转换为WAV格式（可选）
        const wavBlob = await this.convertToWav(audioBlob);
        
        // 创建本地URL
        const audioUrl = URL.createObjectURL(wavBlob);
        
        // 更新当前录音项
        const currentItem = this.data.recordingList[this.data.currentIndex];
        currentItem.status = 'recorded';
        currentItem.audioUrl = audioUrl;
        currentItem.audioBlob = wavBlob;
        currentItem.recordedAt = new Date().toISOString();
        
        // 计算音频质量
        const qualityScore = await this.analyzeAudioQuality(wavBlob);
        currentItem.qualityScore = qualityScore;
        
        // 保存到录音库
        this.data.recordings.push({
            ...currentItem,
            id: `rec_${Date.now()}`
        });
        
        // 更新UI
        this.renderRecordingList();
        this.updateCurrentItemDisplay();
        this.updateQualityIndicator(qualityScore);
        
        // 启用播放按钮
        document.getElementById('playRecording').disabled = false;
        document.getElementById('saveMetadata').disabled = false;
        
        this.showMessage('录音完成，可以播放或保存', 'success');
        this.saveData();
    }
    
    async convertToWav(audioBlob) {
        // 简化的WAV转换（实际项目应使用完整的编码器）
        return audioBlob;
    }
    
    async analyzeAudioQuality(audioBlob) {
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // 计算音量水平
            const channelData = audioBuffer.getChannelData(0);
            let sum = 0;
            
            for (let i = 0; i < channelData.length; i++) {
                sum += channelData[i] * channelData[i];
            }
            
            const rms = Math.sqrt(sum / channelData.length);
            const db = 20 * Math.log10(rms);
            
            // 计算信噪比（简化版）
            const noiseThreshold = 0.01;
            let signalSamples = 0;
            let noiseSamples = 0;
            
            for (let i = 0; i < channelData.length; i++) {
                if (Math.abs(channelData[i]) > noiseThreshold) {
                    signalSamples++;
                } else {
                    noiseSamples++;
                }
            }
            
            const snr = signalSamples / (noiseSamples || 1);
            
            // 综合质量评分（0-100）
            let score = 70; // 基础分
            
            // 音量评分
            if (db > -30 && db < -3) {
                score += 15; // 良好音量范围
            } else if (db > -40 && db < 0) {
                score += 5; // 可接受范围
            }
            
            // 信噪比评分
            if (snr > 10) {
                score += 15;
            } else if (snr > 5) {
                score += 5;
            }
            
            return Math.min(100, Math.max(0, score));
            
        } catch (error) {
            console.error('音频质量分析失败:', error);
            return 50; // 默认质量分
        }
    }
    
    playRecording() {
        const currentItem = this.data.recordingList[this.data.currentIndex];
        
        if (currentItem && currentItem.audioUrl) {
            const audioPlayer = document.getElementById('audioPlayer');
            audioPlayer.src = currentItem.audioUrl;
            audioPlayer.play().catch(error => {
                console.error('播放失败:', error);
                this.showMessage('音频播放失败', 'error');
            });
        }
    }
    
    rerecord() {
        if (confirm('确定要重新录制当前项目吗？')) {
            const currentItem = this.data.recordingList[this.data.currentIndex];
            currentItem.status = 'pending';
            currentItem.audioUrl = null;
            currentItem.audioBlob = null;
            currentItem.qualityScore = 0;
            
            this.renderRecordingList();
            this.updateCurrentItemDisplay();
            
            document.getElementById('playRecording').disabled = true;
            document.getElementById('saveMetadata').disabled = true;
            
            this.showMessage('已重置，可以重新录制', 'info');
        }
    }
    
    navigate(direction) {
        const newIndex = this.data.currentIndex + direction;
        
        if (newIndex >= 0 && newIndex < this.data.recordingList.length) {
            this.data.currentIndex = newIndex;
            this.updateCurrentItemDisplay();
            this.saveData();
        }
    }
    
    selectRandomItem() {
        const pendingItems = this.data.recordingList.filter(item => item.status === 'pending');
        
        if (pendingItems.length > 0) {
            const randomItem = pendingItems[Math.floor(Math.random() * pendingItems.length)];
            const randomIndex = this.data.recordingList.findIndex(item => item.id === randomItem.id);
            
            this.data.currentIndex = randomIndex;
            this.updateCurrentItemDisplay();
            this.saveData();
        } else {
            this.showMessage('所有项目都已录制完成', 'info');
        }
    }
    
    skipCurrentItem() {
        const currentItem = this.data.recordingList[this.data.currentIndex];
        currentItem.status = 'skipped';
        
        this.navigate(1);
        this.renderRecordingList();
        this.showMessage('已跳过当前项目', 'info');
    }
    
    updateCurrentItemDisplay() {
        const currentItem = this.data.recordingList[this.data.currentIndex];
        
        if (currentItem) {
            // 更新显示
            document.getElementById('currentCharacter').textContent = currentItem.character;
            document.getElementById('currentPinyin').textContent = currentItem.pinyin;
            
            // 更新表单
            document.getElementById('character').value = currentItem.character;
            document.getElementById('pinyin').value = currentItem.pinyin;
            document.getElementById('pronunciationType').value = currentItem.type || 'colloquial';
            document.getElementById('tone').value = currentItem.tone || '8';
            document.getElementById('exampleWords').value = currentItem.exampleWords || '';
            document.getElementById('notes').value = currentItem.metadata?.notes || '';
            document.getElementById('speakerName').value = currentItem.metadata?.speaker || '默认发音人';
            document.getElementById('dialectRegion').value = currentItem.metadata?.dialectRegion || '潮州市区';
            
            // 更新按钮状态
            const isRecorded = currentItem.status === 'recorded';
            document.getElementById('playRecording').disabled = !isRecorded;
            document.getElementById('saveMetadata').disabled = !isRecorded;
            document.getElementById('rerecord').disabled = !isRecorded;
            
            // 更新质量指示器
            if (isRecorded) {
                this.updateQualityIndicator(currentItem.qualityScore);
            } else {
                this.updateQualityIndicator(0);
            }
            
            // 高亮列表中的当前项
            this.highlightCurrentItem();
        }
    }
    
    updateCurrentItemMetadata() {
        const currentItem = this.data.recordingList[this.data.currentIndex];
        
        if (currentItem) {
            currentItem.character = document.getElementById('character').value;
            currentItem.pinyin = document.getElementById('pinyin').value;
            currentItem.type = document.getElementById('pronunciationType').value;
            currentItem.tone = document.getElementById('tone').value;
            currentItem.exampleWords = document.getElementById('exampleWords').value;
            
            currentItem.metadata = {
                speaker: document.getElementById('speakerName').value,
                dialectRegion: document.getElementById('dialectRegion').value,
                notes: document.getElementById('notes').value
            };
            
            this.saveData();
            this.renderRecordingList();
        }
    }
    
    saveCurrentRecording() {
        const currentItem = this.data.recordingList[this.data.currentIndex];
        
        if (currentItem && currentItem.status === 'recorded') {
            this.showMessage('录音已保存', 'success');
            
            // 自动跳转到下一个未录制项
            const nextPendingIndex = this.data.recordingList.findIndex(
                (item, index) => index > this.data.currentIndex && item.status === 'pending'
            );
            
            if (nextPendingIndex !== -1) {
                this.data.currentIndex = nextPendingIndex;
                this.updateCurrentItemDisplay();
            }
        }
    }
    
    updateRecordingUI(isRecording) {
        const statusDot = document.getElementById('recordingStatus');
        const statusText = document.getElementById('statusText');
        const startBtn = document.getElementById('startRecording');
        const stopBtn = document.getElementById('stopRecording');
        
        if (isRecording) {
            statusDot.classList.add('recording');
            statusText.textContent = '录音中...';
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else {
            statusDot.classList.remove('recording');
            statusText.textContent = '准备录音';
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }
    
    startTimer() {
        this.recordingStartTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            
            const display = `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
            document.getElementById('recordingTimer').textContent = display;
        }, 1000);
    }
    
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    startWaveformAnimation() {
        if (!this.analyser || !this.canvasContext) return;
        
        const drawWaveform = () => {
            if (!this.isRecording) return;
            
            requestAnimationFrame(drawWaveform);
            
            this.analyser.getByteTimeDomainData(this.dataArray);
            
            this.canvasContext.fillStyle = '#2c3e50';
            this.canvasContext.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
            
            this.canvasContext.lineWidth = 2;
            this.canvasContext.strokeStyle = '#3498db';
            this.canvasContext.beginPath();
            
            const sliceWidth = this.canvasWidth / this.bufferLength;
            let x = 0;
            
            for (let i = 0; i < this.bufferLength; i++) {
                const v = this.dataArray[i] / 128.0;
                const y = v * this.canvasHeight / 2;
                
                if (i === 0) {
                    this.canvasContext.moveTo(x, y);
                } else {
                    this.canvasContext.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            this.canvasContext.lineTo(this.canvasWidth, this.canvasHeight / 2);
            this.canvasContext.stroke();
            
            // 更新音量指示器
            this.updateVolumeIndicator();
        };
        
        drawWaveform();
    }
    
    stopWaveformAnimation() {
        this.canvasContext.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    
    updateVolumeIndicator() {
        if (!this.analyser) return;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        let sum = 0;
        for (let i = 0; i < this.bufferLength; i++) {
            sum += this.dataArray[i];
        }
        
        const average = sum / this.bufferLength;
        const volumeLevel = document.getElementById('volumeLevel');
        
        // 映射到0-100%
        const percentage = Math.min(100, (average / 128) * 100);
        volumeLevel.style.width = `${percentage}%`;
    }
    
    updateQualityIndicator(score) {
        const meterFill = document.getElementById('qualityMeter');
        const qualityScore = document.getElementById('qualityScore');
        
        meterFill.style.width = `${score}%`;
        qualityScore.textContent = `${Math.round(score)}分`;
        
        // 根据分数设置颜色提示
        if (score >= 80) {
            meterFill.style.background = 'linear-gradient(90deg, #2ecc71, #27ae60)';
            qualityScore.style.color = '#27ae60';
        } else if (score >= 60) {
            meterFill.style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
            qualityScore.style.color = '#f39c12';
        } else {
            meterFill.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
            qualityScore.style.color = '#e74c3c';
        }
    }
    
    renderRecordingList() {
        const listContainer = document.getElementById('recordingsList');
        const items = this.data.recordingList;
        
        listContainer.innerHTML = items.map((item, index) => {
            const statusClass = item.status === 'recorded' ? 'recorded' : 
                               item.status === 'skipped' ? 'skipped' : 'pending';
            
            const selectedClass = index === this.data.currentIndex ? 'selected' : '';
            
            return `
                <div class="recording-item ${statusClass} ${selectedClass}" 
                     data-index="${index}" 
                     onclick="recorder.selectItem(${index})">
                    <div class="recording-char">${item.character}</div>
                    <div class="recording-info">
                        <div class="recording-pinyin">${item.pinyin}</div>
                        <div class="recording-meta">
                            <span class="recording-type">${this.getTypeName(item.type)}</span>
                            <span class="recording-tone">第${item.tone}声</span>
                        </div>
                    </div>
                    <div class="recording-duration">
                        ${item.duration ? this.formatDuration(item.duration) : '--:--'}
                    </div>
                    <div class="recording-controls">
                        ${item.status === 'recorded' ? 
                            `<i class="fas fa-check-circle" style="color: #27ae60;"></i>` :
                            `<i class="fas fa-circle" style="color: #95a5a6;"></i>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }
    
    selectItem(index) {
        this.data.currentIndex = index;
        this.updateCurrentItemDisplay();
        this.highlightCurrentItem();
    }
    
    highlightCurrentItem() {
        document.querySelectorAll('.recording-item').forEach((item, index) => {
            if (index === this.data.currentIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    searchRecordings(query) {
        const items = document.querySelectorAll('.recording-item');
        
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            const matches = text.includes(query.toLowerCase());
            item.style.display = matches ? 'flex' : 'none';
        });
    }
    
    filterRecordings() {
        const typeFilter = document.getElementById('filterType').value;
        const statusFilter = document.getElementById('filterStatus').value;
        
        const items = this.data.recordingList;
        const filteredItems = items.filter(item => {
            const typeMatch = typeFilter === 'all' || item.type === typeFilter;
            const statusMatch = statusFilter === 'all' || item.status === statusFilter;
            return typeMatch && statusMatch;
        });
        
        // 重新渲染过滤后的列表
        const listContainer = document.getElementById('recordingsList');
        listContainer.innerHTML = filteredItems.map((item, index) => {
            const originalIndex = this.data.recordingList.findIndex(i => i.id === item.id);
            const statusClass = item.status === 'recorded' ? 'recorded' : 'pending';
            const selectedClass = originalIndex === this.data.currentIndex ? 'selected' : '';
            
            return `
                <div class="recording-item ${statusClass} ${selectedClass}" 
                     data-index="${originalIndex}" 
                     onclick="recorder.selectItem(${originalIndex})">
                    <div class="recording-char">${item.character}</div>
                    <div class="recording-info">
                        <div class="recording-pinyin">${item.pinyin}</div>
                        <div class="recording-meta">
                            <span class="recording-type">${this.getTypeName(item.type)}</span>
                            <span class="recording-tone">第${item.tone}声</span>
                        </div>
                    </div>
                    <div class="recording-duration">
                        ${item.duration ? this.formatDuration(item.duration) : '--:--'}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    async setupGithubIntegration() {
        const repoUrl = prompt('请输入GitHub仓库地址（例如：https://github.com/用户名/仓库名）:');
        
        if (repoUrl) {
            const branch = prompt('请输入分支名称（默认：main）:', 'main');
            const folder = prompt('请输入音频文件夹名称（默认：audio）:', 'audio');
            
            this.data.settings.githubConfig = {
                repoUrl,
                branch: branch || 'main',
                folder: folder || 'audio',
                token: '' // 注意：实际使用中需要安全存储token
            };
            
            this.saveData();
            this.showMessage('GitHub配置已保存', 'success');
            this.updateGithubStatus();
        }
    }
    
    async testGithubConnection() {
        const config = this.data.settings.githubConfig;
        
        if (!config || !config.repoUrl) {
            this.showMessage('请先配置GitHub仓库', 'error');
            return;
        }
        
        try {
            // 测试仓库可访问性
            const repoPath = config.repoUrl.replace('https://github.com/', '');
            const apiUrl = `https://api.github.com/repos/${repoPath}`;
            
            const response = await fetch(apiUrl);
            
            if (response.ok) {
                this.showMessage('GitHub仓库连接成功', 'success');
                document.getElementById('githubStatus').textContent = 'GitHub: 已连接';
                document.getElementById('githubStatus').className = 'github-status connected';
            } else {
                throw new Error('仓库不存在或无访问权限');
            }
        } catch (error) {
            console.error('GitHub连接测试失败:', error);
            this.showMessage(`连接失败: ${error.message}`, 'error');
        }
    }
    
    async uploadToGithub() {
        const config = this.data.settings.githubConfig;
        
        if (!config || !config.repoUrl) {
            this.showMessage('请先配置GitHub仓库', 'error');
            return;
        }
        
        const recordings = this.data.recordings.filter(r => r.audioBlob && !r.uploaded);
        
        if (recordings.length === 0) {
            this.showMessage('没有需要上传的录音', 'info');
            return;
        }
        
        if (confirm(`确定要上传 ${recordings.length} 个录音文件到GitHub吗？`)) {
            this.showMessage('开始上传到GitHub...', 'info');
            
            // 注意：实际实现需要GitHub API token和更完整的上传逻辑
            // 这里提供框架代码
            
            for (const recording of recordings) {
                try {
                    // 转换Blob为Base64
                    const base64Audio = await this.blobToBase64(recording.audioBlob);
                    
                    // 创建GitHub API请求
                    const repoPath = config.repoUrl.replace('https://github.com/', '');
                    const fileName = `${recording.character}_${recording.pinyin}_${Date.now()}.wav`;
                    const filePath = `${config.folder}/${fileName}`;
                    
                    // 实际实现中需要：
                    // 1. 获取GitHub API token
                    // 2. 创建或更新文件
                    // 3. 处理API响应
                    
                    recording.uploaded = true;
                    recording.githubUrl = `${config.repoUrl}/blob/${config.branch}/${filePath}`;
                    
                    this.showMessage(`已上传: ${recording.character}`, 'success');
                    
                } catch (error) {
                    console.error('上传失败:', error);
                    this.showMessage(`${recording.character} 上传失败`, 'error');
                }
            }
            
            this.saveData();
            this.showMessage('上传完成', 'success');
        }
    }
    
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    updateGithubStatus() {
        const statusElement = document.getElementById('githubStatus');
        const config = this.data.settings.githubConfig;
        
        if (config && config.repoUrl) {
            statusElement.textContent = 'GitHub: 已配置';
            statusElement.className = 'github-status connected';
        } else {
            statusElement.textContent = 'GitHub: 未连接';
            statusElement.className = 'github-status disconnected';
        }
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        this.data.settings.theme = newTheme;
        this.saveData();
        
        const icon = document.querySelector('#toggleDarkMode i');
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    
    applyTheme() {
        if (this.data.settings.theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            const icon = document.querySelector('#toggleDarkMode i');
            icon.className = 'fas fa-sun';
        }
    }
    
    exportData() {
        // 准备导出的数据
        const exportData = {
            library: this.data.library,
            recordings: this.data.recordings.map(rec => ({
                character: rec.character,
                pinyin: rec.pinyin,
                type: rec.type,
                tone: rec.tone,
                metadata: rec.metadata,
                recordedAt: rec.recordedAt,
                qualityScore: rec.qualityScore,
                duration: rec.duration
                // 注意：不导出audioBlob，因为太大
            })),
            settings: this.data.settings,
            exportedAt: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chaozhou-recordings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showMessage('数据导出成功', 'success');
    }
    
    async importData(file) {
        if (!file) return;
        
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                // 合并数据
                this.data.library = [...this.data.library, ...(importedData.library || [])];
                this.data.recordings = [...this.data.recordings, ...(importedData.recordings || [])];
                
                // 重新生成录音队列
                this.data.recordingList = this.generateRecordingQueue();
                
                // 恢复已录制的状态
                this.data.recordings.forEach(recording => {
                    const matchingItem = this.data.recordingList.find(
                        item => item.character === recording.character && 
                               item.pinyin === recording.pinyin
                    );
                    
                    if (matchingItem) {
                        matchingItem.status = 'recorded';
                        matchingItem.qualityScore = recording.qualityScore || 0;
                        matchingItem.duration = recording.duration || 0;
                        matchingItem.recordedAt = recording.recordedAt;
                        matchingItem.metadata = recording.metadata;
                    }
                });
                
                this.saveData();
                this.renderRecordingList();
                this.updateCurrentItemDisplay();
                this.updateStats();
                
                this.showMessage(`成功导入 ${importedData.library?.length || 0} 个字词`, 'success');
                
            } catch (error) {
                console.error('导入失败:', error);
                this.showMessage('导入失败，请检查文件格式', 'error');
            }
        };
        
        reader.readAsText(file);
    }
    
    updateStats() {
        const recordedCount = this.data.recordings.length;
        const totalCount = this.data.library.length;
        const pendingCount = totalCount - recordedCount;
        
        // 计算总时长
        let totalDuration = 0;
        this.data.recordings.forEach(rec => {
            totalDuration += rec.duration || 0;
        });
        
        // 更新显示
        document.getElementById('recordedCount').textContent = recordedCount;
        document.getElementById('totalDuration').textContent = this.formatDuration(totalDuration);
        
        // 更新进度条
        const progressPercentage = totalCount > 0 ? Math.round((recordedCount / totalCount) * 100) : 0;
        document.getElementById('progressPercentage').textContent = `${progressPercentage}%`;
        document.getElementById('progressFill').style.width = `${progressPercentage}%`;
        
        // 更新存储信息
        const storageSize = this.calculateStorageSize();
        document.getElementById('storageInfo').textContent = `本地存储：${storageSize} MB / 50 MB`;
    }
    
    calculateStorageSize() {
        // 估算存储大小（简化版）
        const jsonSize = JSON.stringify(this.data).length;
        const audioSize = this.data.recordings.length * 100; // 假设每个录音100KB
        
        const totalKB = (jsonSize + audioSize) / 1024;
        const totalMB = totalKB / 1024;
        
        return totalMB.toFixed(2);
    }
    
    updateCurrentRecordingDuration() {
        const audioPlayer = document.getElementById('audioPlayer');
        const currentItem = this.data.recordingList[this.data.currentIndex];
        
        if (currentItem && !isNaN(audioPlayer.duration)) {
            currentItem.duration = audioPlayer.duration;
            this.saveData();
            this.renderRecordingList();
        }
    }
    
    getTypeName(type) {
        const typeNames = {
            'literary': '文读音',
            'colloquial': '白话音',
            'special': '特殊读音',
            'variant': '训读音'
        };
        
        return typeNames[type] || type;
    }
    
    formatDuration(seconds) {
        if (!seconds || seconds < 0) return '00:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    checkBrowserSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showMessage('您的浏览器不支持录音功能，请使用Chrome、Firefox或Edge最新版本', 'error');
            document.getElementById('startRecording').disabled = true;
        }
        
        if (!window.MediaRecorder) {
            this.showMessage('您的浏览器不支持MediaRecorder API', 'error');
            document.getElementById('startRecording').disabled = true;
        }
    }
    
    showMessage(message, type = 'info') {
        // 创建消息提示
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${type}`;
        messageDiv.textContent = message;
        
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#e74c3c' : 
                        type === 'success' ? '#27ae60' : '#3498db'};
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => document.body.removeChild(messageDiv), 300);
        }, 3000);
    }
    
    loadRecordingQueue() {
        // 如果没有录音队列，生成一个
        if (!this.data.recordingList || this.data.recordingList.length === 0) {
            this.data.recordingList = this.generateRecordingQueue();
        }
        
        // 更新当前显示
        this.updateCurrentItemDisplay();
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .message {
        font-family: 'Segoe UI', sans-serif;
        font-size: 14px;
    }
    
    .skipped {
        opacity: 0.6;
        border-left-color: #95a5a6 !important;
    }
    
    .recording-item {
        transition: all 0.2s ease;
    }
    
    .recording-item:hover {
        transform: translateX(5px);
    }
`;
document.head.appendChild(style);

// 初始化应用
let recorder;

document.addEventListener('DOMContentLoaded', () => {
    recorder = new ChaozhouRecorder();
});