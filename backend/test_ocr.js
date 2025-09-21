// 改进的OCR测试脚本 - 支持多语言识别
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

// 使用用户指定的测试图片
const testImagePath = 'E:\\Users\\Administrator\\Desktop\\实例电路.jpg';

// 检查训练数据文件
const trainedDataFiles = ['eng.traineddata', 'chi_sim.traineddata', 'chi_tra.traineddata'];
console.log('检查训练数据文件:');
trainedDataFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`${file}: ${exists ? '✓' : '✗'}`);
});

if (!fs.existsSync(testImagePath)) {
  console.log(`测试图片不存在: ${testImagePath}`);
  console.log('请确保图片文件存在');
  process.exit(1);
}

var selectedImagePath = testImagePath;
console.log(`测试图片: ${selectedImagePath}`);

async function testOCR() {
  console.log('开始OCR功能测试...');

  // 首先测试OCR worker创建
  let worker = null;
  try {
    console.log('1. 创建OCR worker...');
    worker = await createWorker();
    console.log('✓ OCR worker创建成功');

    console.log('2. 加载中文和英文语言包...');
    // 先尝试加载中文
    try {
      await worker.loadLanguage('chi_sim');
      await worker.initialize('chi_sim');
      console.log('✓ 中文语言包加载成功');
    } catch (chineseError) {
      console.log('中文语言包加载失败，尝试英文:', chineseError.message);
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      console.log('✓ 英文语言包加载成功');
    }

    // 如果有有效的图片文件，测试识别
    if (selectedImagePath && fs.existsSync(selectedImagePath)) {
      const stats = fs.statSync(selectedImagePath);
      console.log(`3. 测试图片信息: ${stats.size} bytes`);

      if (stats.size > 1000) { // 只有当文件大于1KB时才测试识别
        console.log('4. 开始OCR识别...');
        const { data: { text, confidence, words } } = await worker.recognize(selectedImagePath);

        console.log(`\n=== OCR结果 ===`);
        console.log(`识别文本长度: ${text.length}`);
        console.log(`置信度: ${confidence.toFixed(2)}`);
        console.log(`单词数量: ${words.length}`);
        console.log(`\n识别文本:\n${text}`);

        // 分析提取的元件信息
        const componentPatterns = [
          /\b(U|IC|CHIP)\d+\b/gi,
          /\b(R|RES|RESISTOR)\d+\b/gi,
          /\b(C|CAP|CAPACITOR)\d+\b/gi,
          /\b(L|IND|INDUCTOR)\d+\b/gi,
          /\b(D|DIODE)\d+\b/gi,
          /\b(Q|TRANSISTOR)\d+\b/gi,
        ];

        console.log(`\n=== 提取的元件标识符 ===`);
        componentPatterns.forEach(pattern => {
          const matches = text.match(pattern);
          if (matches) {
            console.log(`${pattern}: ${matches.join(', ')}`);
          }
        });

        // 查找数值
        const valuePatterns = [
          /\b\d+(\.\d+)?\s*(k|m|μ|u|µ|Ω|ohm|r|R)\b/gi,
          /\b\d+(\.\d+)?\s*(p|n|μ|u|µ|m|f|F)\b/gi,
          /\b[A-Z]{2,6}\d{1,4}[A-Z0-9]*\b/g
        ];

        console.log(`\n=== 提取的数值 ===`);
        valuePatterns.forEach(pattern => {
          const matches = text.match(pattern);
          if (matches) {
            console.log(`${pattern}: ${matches.join(', ')}`);
          }
        });
      } else {
        console.log('4. 图片文件太小，跳过识别测试');
      }
    } else {
      console.log('3. 没有找到有效的测试图片');
    }

    console.log('✓ OCR功能测试完成');

  } catch (error) {
    console.error('❌ OCR测试失败:', error.message);
    console.error('错误详情:', error);
  } finally {
    if (worker) {
      try {
        await worker.terminate();
        console.log('✓ OCR worker已清理');
      } catch (e) {
        console.error('❌ 清理worker失败:', e);
      }
    }
  }
}

testOCR().then(() => {
  console.log('OCR测试完成');
  process.exit(0);
}).catch(error => {
  console.error('测试脚本错误:', error);
  process.exit(1);
});
