# 潮州话发音录音库 - GitHub部署指南

## 1. 创建GitHub仓库

1. 访问 https://github.com 并登录
2. 点击右上角 "+" → "New repository"
3. 设置仓库信息：
   - Repository name: `chaozhou-audio-library`
   - Description: `潮州话发音开源录音库`
   - 选择 Public（公开）
   - 勾选 "Add a README file"
4. 点击 "Create repository"

## 2. 配置仓库以托管音频文件

### 方法A：使用GitHub Pages（推荐）
1. 进入仓库的 "Settings" → "Pages"
2. 在 "Source" 部分选择 "Deploy from a branch"
3. 选择 "main" 分支和 "/ (root)" 文件夹
4. 点击 "Save"
5. 等待几分钟，你的音频库将在 `https://[你的用户名].github.io/chaozhou-audio-library/` 上线

### 方法B：直接使用GitHub Raw链接
- 音频文件的直接链接格式：https://raw.githubusercontent.com/[你的用户名]/[仓库名]/[分支名]/[文件夹]/[文件名]
例如：https://raw.githubusercontent.com/chaozhou/audio-library/main/audio/%E9%A3%9F_ziak8.wav

## 3. 在录音系统中配置GitHub

1. 打开录音系统网页
2. 点击右上角的GitHub图标
3. 输入你的仓库信息：
 - 仓库地址：`https://github.com/你的用户名/chaozhou-audio-library`
 - 分支：`main`
 - 音频文件夹：`audio`
4. 点击"测试连接"确认配置正确

## 4. 手动上传音频文件到GitHub

### 方法A：通过网页上传
1. 在GitHub仓库页面，点击 "Add file" → "Upload files"
2. 将录音系统生成的音频文件拖到页面中
3. 建议按以下结构组织：
audio/
├── characters/ # 单字录音
│ ├── 食/
│ │ ├── ziak8.wav
│ │ └── ziak8.json # 元数据
│ └── ...
├── words/ # 词语录音
└── sentences/ # 句子录音
4. 添加提交信息，点击 "Commit changes"

### 方法B：使用Git命令行
```bash
# 克隆仓库
git clone https://github.com/你的用户名/chaozhou-audio-library.git
cd chaozhou-audio-library

# 创建目录结构
mkdir -p audio/characters audio/words audio/sentences

# 添加音频文件
# 将录音系统生成的音频文件复制到相应目录

# 提交更改
git add .
git commit -m "添加潮州话发音录音"
git push origin main

命名规范
使用UTF-8编码保存文件名
避免使用特殊字符
推荐命名格式：汉字_拼音.扩展名