// ==UserScript==
// @name         武汉理工党校题库提取
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  完美TXT排版，支持页面DOM直接扫描，新增高级API接口挖掘调试面板，云端题库共享查答案+自动答题+贡献答案
// @author       毫厘
// @match        *://wsdx.whut.edu.cn/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @connect      gitee.com
// @connect      whut-qbank-worker.tianye0126.workers.dev
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // ☁️ 云端题库配置
    // ==========================================
    const CLOUD = {
        rawBase: 'https://gitee.com/fieldlu/party-member-treasury/raw/main/qbank',
        workerBase: 'https://whut-qbank-worker.tianye0126.workers.dev',
        autoAnswerEnabled: true
    };

    // ==========================================
    // 1. 本地数据库模块
    // ==========================================
    const DB_KEY = 'whut_qbank_db_v1';

    function getDB() {
        try { return JSON.parse(GM_getValue(DB_KEY, '[]')); } catch (e) { return []; }
    }

    function saveToDB(newQuestions) {
        let db = getDB();
        let addedCount = 0;
        let existingIds = new Set(db.map(q => q.content));

        for (let raw of newQuestions) {
            let q = normalizeQuestion(raw);
            if (!q || !q.content) continue;
            if (!existingIds.has(q.content)) {
                db.push(q);
                existingIds.add(q.content);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            GM_setValue(DB_KEY, JSON.stringify(db));
            updateStats(db.length);
        }
        return addedCount;
    }

    function clearDB() {
        if(confirm("确定清空本地题库吗？清空后无法恢复！（云端题库不受影响）")) {
            GM_deleteValue(DB_KEY);
            updateStats(0);
            log("本地数据库已清空。");
        }
    }

    // ==========================================
    // 2. 数据清洗与规范化
    // ==========================================
    function normalizeQuestion(raw) {
        let q = raw.dataJson || raw;
        let typeStr = q.type || raw.type || raw.realType || '';
        let content = q.content || raw.content || '';
        let answer = q.answer || raw.answer || '';
        let options = q.options || raw.options || [];

        if (!content) return null;

        let realType = "未知题型";
        if (typeStr.includes('SINGLE')) realType = "单选题";
        else if (typeStr.includes('MULTIPLE')) realType = "多选题";
        else if (typeStr.includes('JUDGMENT')) realType = "判断题";
        else if (typeStr.includes('BLANKFILL')) realType = "填空题";
        else if (raw.realType) realType = raw.realType;

        content = content.replace(/<[^>]+>/g, '').trim();
        content = content.replace(/\[BlankArea\d*\]/gi, '______');

        let normOptions = [];
        if (Array.isArray(options)) {
            normOptions = options.map(opt => ({
                alias: opt.alisa || opt.alias || '',
                text: (opt.text || '').replace(/<[^>]+>/g, '').trim()
            }));
        }

        if (realType === "判断题") {
            if (answer === 'Y' || answer === 'true') answer = "正确";
            else if (answer === 'N' || answer === 'false') answer = "错误";
        } else if (realType === "填空题" && raw.blanks && Array.isArray(raw.blanks)) {
            answer = raw.blanks.map(b => b.value).join(" ; ");
        }

        return { type: realType, content, options: normOptions, answer };
    }

    function extractQuestionsFromData(obj) {
        let questions = [];
        let cache = new Set();

        function search(item) {
            if (!item || typeof item !== 'object' || cache.has(item)) return;
            cache.add(item);
            if ((item.type || item.realType) && item.content) {
                if(item.type && ['SINGLE', 'MULTIPLE', 'JUDGMENT', 'BLANKFILL', 'ESSAY'].some(t => item.type.includes(t) || (item.realType && item.realType.includes(t)))){
                    questions.push(item);
                }
            }
            for (let key in item) {
                if (Object.prototype.hasOwnProperty.call(item, key)) search(item[key]);
            }
        }
        search(obj);
        return questions;
    }

    // ==========================================
    // ☁️ 云端题库引擎
    // ==========================================
    let cloudIndex = null; // 云端题库索引缓存

    // 查询云端题库索引
    async function fetchCloudIndex(forceRefresh = false) {
        if (cloudIndex && !forceRefresh) return cloudIndex;
        try {
            const res = await fetch(`${CLOUD.rawBase}/index.json?t=${Date.now()}`);
            if (!res.ok) throw new Error('索引不存在');
            cloudIndex = await res.json();
            log(`☁️ 云端题库索引已加载：${cloudIndex.courses?.length || 0} 门课程`);
            return cloudIndex;
        } catch(e) {
            log(`⚠️ 无法加载云端索引，云端功能暂不可用`);
            return { courses: [], count: {} };
        }
    }

    // 从云端查询单个答案
    async function queryCloudAnswer(course, questionContent) {
        const normalizedQuery = questionContent.replace(/<[^>]+>/g, '').trim();
        try {
            const res = await fetch(`${CLOUD.rawBase}/${encodeURIComponent(course)}.json?t=${Date.now()}`);
            if (!res.ok) return null;
            const bank = await res.json();
            const found = bank.find(q => {
                let dbContent = (q.content || '').replace(/<[^>]+>/g, '').trim();
                // 模糊匹配：题目核心关键词命中
                const queryKeywords = extractKeywords(normalizedQuery);
                const dbKeywords = extractKeywords(dbContent);
                const overlap = queryKeywords.filter(k => dbKeywords.includes(k)).length;
                return overlap >= Math.min(queryKeywords.length, 3);
            });
            return found || null;
        } catch(e) {
            return null;
        }
    }

    // 从云端批量查询答案
    async function queryCloudBatch(course, questions) {
        try {
            const res = await fetch(`${CLOUD.rawBase}/${encodeURIComponent(course)}.json?t=${Date.now()}`);
            if (!res.ok) return [];
            const bank = await res.json();
            return questions.map(q => {
                const normalizedQuery = (q.content || '').replace(/<[^>]+>/g, '').trim();
                const queryKeywords = extractKeywords(normalizedQuery);
                const found = bank.find(bq => {
                    let dbContent = (bq.content || '').replace(/<[^>]+>/g, '').trim();
                    const dbKeywords = extractKeywords(dbContent);
                    const overlap = queryKeywords.filter(k => dbKeywords.includes(k)).length;
                    return overlap >= Math.min(queryKeywords.length, 3);
                });
                return found || null;
            });
        } catch(e) {
            return questions.map(() => null);
        }
    }

    // 提取关键词（去掉标点和常见停用词）
    function extractKeywords(text) {
        return text
            .replace(/[，。、；：？！""''（）\(\)《》【】\[\]{}.,;:!?\"\'\(\)\[\]{}<>\/\\|@#$%^&*+=~`_-]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 2)
            .filter(w => !['以下','选项','的是','正确','错误','关于','下列','不是','属于'].includes(w));
    }

    // 贡献到云端（通过 Cloudflare Worker）
    async function contributeToCloud(course, questions) {
        if (!course) { log('❌ 贡献失败：未提供课程标识'); return false; }
        if (!questions || questions.length === 0) { log('❌ 贡献失败：题目列表为空'); return false; }

        const cleanQuestions = questions.map(q => ({
            type: q.type,
            content: q.content,
            options: q.options,
            answer: q.answer
        }));

        try {
            const response = await fetch(`${CLOUD.workerBase}/contribute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ course, questions: cleanQuestions })
            });
            const result = await response.json();
            if (result.success) {
                log(`☁️ 贡献成功！新增 ${result.added} 题，跳过 ${result.skipped} 题（云端共 ${result.total} 题）`);
                return true;
            } else {
                log(`❌ 贡献失败：${result.error}`);
                return false;
            }
        } catch(e) {
            log(`❌ 贡献网络异常：${e.message}（Worker 可能未部署，或 workerBase 地址未配置）`);
            return false;
        }
    }

    // 一键上传本地全部题库到云端
    async function uploadAllToCloud(course) {
        if (!course) { log('❌ 请先输入课程标识（如 gongchenglunli）'); return; }
        const db = getDB();
        if (db.length === 0) { log('❌ 本地题库为空'); return; }
        log(`📤 正在上传本地 ${db.length} 题到云端（课程：${course}）...`);
        await contributeToCloud(course, db);
    }

    // 从云端下载题库到本地
    async function downloadCloudToLocal(course) {
        if (!course) { log('❌ 请先输入课程标识'); return; }
        try {
            const res = await fetch(`${CLOUD.rawBase}/${encodeURIComponent(course)}.json?t=${Date.now()}`);
            if (!res.ok) { log('❌ 云端未找到该课程题库'); return; }
            const bank = await res.json();
            const added = saveToDB(bank);
            log(`☁️ 已从云端下载 ${added} 新题到本地（云端共 ${bank.length} 题）`);
            updateStats(getDB().length);
        } catch(e) {
            log(`❌ 下载失败：${e.message}`);
        }
    }

    // ==========================================
    // 🎯 自动答题引擎
    // ==========================================
    let autoAnswerTimer = null;

    // 解析当前页面显示的题目
    function parseCurrentPageQuestions(course) {
        let found = [];
        // 方法1：从 Vue 实例提取
        const allElements = document.querySelectorAll('*');
        for (let el of allElements) {
            if (el.__vue__) {
                try {
                    let vueData = JSON.parse(JSON.stringify(el.__vue__.$data || {}));
                    let extracted = extractQuestionsFromData(vueData);
                    found = found.concat(extracted);
                } catch(e) {}
            }
        }
        // 方法2：DOM 选择器找题目文本
        if (found.length === 0) {
            const questionEls = document.querySelectorAll('[class*="question"], [class*="topic"], [class*="subject"], .q-title, .q-content');
            questionEls.forEach(el => {
                const text = el.textContent.trim();
                if (text.length > 10) {
                    found.push({ content: text, type: '未知题型', options: [], answer: '' });
                }
            });
        }
        return found;
    }

    // 执行自动答题
    async function doAutoAnswer(course) {
        if (!CLOUD.autoAnswerEnabled) return;
        log('🎯 自动答题引擎启动，正在识别页面题目...');

        const pageQuestions = parseCurrentPageQuestions(course);
        if (pageQuestions.length === 0) {
            log('⚠️ 未在页面检测到题目');
            return;
        }
        log(`📋 检测到 ${pageQuestions.length} 道题目，正在查询答案...`);

        // 1. 先查本地
        const db = getDB();
        let answeredCount = 0;
        for (const pq of pageQuestions) {
            const cleanContent = pq.content.replace(/<[^>]+>/g, '').trim();
            const queryKeywords = extractKeywords(cleanContent);

            // 本地查找
            let match = db.find(q => {
                let dbc = (q.content || '').replace(/<[^>]+>/g, '').trim();
                const dbk = extractKeywords(dbc);
                return queryKeywords.filter(k => dbk.includes(k)).length >= Math.min(queryKeywords.length, 3);
            });

            // 云端查找
            if (!match) {
                match = await queryCloudAnswer(course, cleanContent);
            }

            if (match && match.answer) {
                fillAnswerToPage(pq, match);
                answeredCount++;
                log(`✅ [${pq.type || '?'}] ${cleanContent.substring(0, 30)}... → 答案：${match.answer}`);
            } else {
                log(`❓ [${pq.type || '?'}] ${cleanContent.substring(0, 30)}... → 未找到答案`);
            }
        }

        log(`🎯 自动答题完成：${answeredCount}/${pageQuestions.length} 题已填入答案`);
    }

    // 将答案填入页面控件
    function fillAnswerToPage(question, match) {
        const answer = match.answer;
        const type = match.type || question.type;

        if (type === '判断题' || type === 'JUDGMENT') {
            const correctVal = (answer === '正确' || answer === 'Y' || answer === 'true') ? 'Y' : 'N';
            // 尝试点击正确/错误按钮
            const allBtns = document.querySelectorAll('button, label, .option, .choice, [class*="option"]');
            allBtns.forEach(btn => {
                const txt = (btn.textContent || '').trim();
                if ((correctVal === 'Y' && txt.includes('正确')) || (correctVal === 'N' && txt.includes('错误'))) {
                    btn.click();
                }
            });
            // 尝试 radio
            const radios = document.querySelectorAll('input[type="radio"]');
            radios.forEach(r => {
                const label = r.closest('label')?.textContent?.trim() || '';
                if ((correctVal === 'Y' && label.includes('正确')) || (correctVal === 'N' && label.includes('错误'))) {
                    r.click();
                }
            });
        } else if (type === '单选题' || type === 'SINGLE') {
            // 匹配选项
            const options = match.options || [];
            let targetAlias = answer;
            if (options.length > 0) {
                const matchedOpt = options.find(o => o.alias === answer);
                if (matchedOpt) targetAlias = matchedOpt.alias;
            }
            // 点击对应选项
            const allOptions = document.querySelectorAll('label, .option, [class*="option"], [class*="choice"]');
            allOptions.forEach(opt => {
                const txt = (opt.textContent || '').trim();
                if (txt.startsWith(targetAlias + '.') || txt.startsWith(targetAlias + '、') || txt === targetAlias) {
                    opt.click();
                }
            });
            // radio
            const radios = document.querySelectorAll('input[type="radio"]');
            radios.forEach(r => {
                const val = r.value || '';
                const label = r.closest('label')?.textContent?.trim() || '';
                if (val === targetAlias || label.startsWith(targetAlias + '.') || label.startsWith(targetAlias + '、')) {
                    r.click();
                }
            });
        } else if (type === '多选题' || type === 'MULTIPLE') {
            const answers = answer.split(/[,，\s]+/).filter(Boolean);
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
                const val = cb.value || '';
                const label = cb.closest('label')?.textContent?.trim() || '';
                if (answers.some(a => val === a || label.startsWith(a + '.') || label.startsWith(a + '、'))) {
                    cb.checked = true;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        } else if (type === '填空题' || type === 'BLANKFILL') {
            const inputs = document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
            const answers = answer.split(/\s*;\s*/);
            inputs.forEach((inp, i) => {
                if (i < answers.length) {
                    if (inp.contentEditable === 'true') {
                        inp.textContent = answers[i];
                    } else {
                        inp.value = answers[i];
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            });
        }
    }

    // 页面监控：检测到题目页面时自动触发答题
    function watchForQuestions(course) {
        if (autoAnswerTimer) clearInterval(autoAnswerTimer);
        autoAnswerTimer = setInterval(() => {
            if (!CLOUD.autoAnswerEnabled) return;
            const questions = parseCurrentPageQuestions(course);
            if (questions.length > 0) {
                clearInterval(autoAnswerTimer);
                doAutoAnswer(course);
            }
        }, 2000);
        // 30秒后停止扫描
        setTimeout(() => { if (autoAnswerTimer) clearInterval(autoAnswerTimer); }, 30000);
    }

    // ==========================================
    // 3. UI 界面构建
    // ==========================================
    let logArea, countSpan, cloudCountSpan;

    function initPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed; top: 10px; right: 10px; width: 360px; max-height: 92vh; overflow-y: auto;
            background: #fff; border: 2px solid #2c3e50; border-radius: 8px;
            box-shadow: 0 6px 16px rgba(0,0,0,0.3); z-index: 9999999;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13px; color: #333;
        `;

        panel.innerHTML = `
            <div id="tk-header" style="background: linear-gradient(135deg, #2c3e50, #3498db); color:#fff; padding:12px; cursor:move; font-weight:bold; text-align:center; border-radius: 6px 6px 0 0;">
                🛠️ 题库挖掘终端 v0.2 ☁️
            </div>
            <div style="padding: 12px;">

                <!-- ☁️ 云端状态 -->
                <div style="margin-bottom:10px; background: linear-gradient(135deg, #e8f5e9, #c8e6c9); padding: 10px; border-radius: 6px; border: 1px solid #a5d6a7;">
                    <div style="font-weight:bold; color:#2e7d32; margin-bottom: 4px;">☁️ 云端题库 (Gitee)</div>
                    <div style="font-size: 12px; color:#388e3c;">
                        课程数：<span id="tk-cloud-courses" style="font-weight:bold;">加载中...</span>
                        <button id="btn-cloud-refresh" style="margin-left: 8px; background:none; border:1px solid #4caf50; color:#4caf50; padding:2px 8px; border-radius:3px; cursor:pointer; font-size:11px;">刷新</button>
                    </div>
                </div>

                <div style="margin-bottom:10px; color:#e74c3c; font-weight:bold;">
                    🎯 本地已存题库: <span id="tk-count" style="font-size:16px;">0</span> 题
                </div>

                <!-- ☁️ 课程标识 & 云端操作 -->
                <div style="display:flex; gap:5px; margin-bottom:6px;">
                    <input type="text" id="tk-course" placeholder="课程标识（如 gongchenglunli）" style="flex:1; padding:6px; border:1px solid #3498db; border-radius:4px; font-size:12px;">
                </div>
                <div style="display:flex; gap:5px; margin-bottom:8px;">
                    <button id="btn-cloud-upload" style="flex:1; background: linear-gradient(135deg, #27ae60, #2ecc71); color:#fff; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">📤 上传本地到云端</button>
                    <button id="btn-cloud-download" style="flex:1; background: linear-gradient(135deg, #2980b9, #3498db); color:#fff; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">📥 从云端下载</button>
                </div>

                <!-- 自动答题 -->
                <div style="margin-bottom:8px; background: linear-gradient(135deg, #fff3e0, #ffe0b2); padding: 8px 10px; border-radius: 4px; border: 1px solid #ffcc80; display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-size:12px; font-weight:bold; color:#e65100;">🎯 自动答题</span>
                    <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                        <input type="checkbox" id="tk-auto-answer" ${CLOUD.autoAnswerEnabled ? 'checked' : ''} style="accent-color:#e65100;">
                        <span style="font-size:11px;">开启</span>
                    </label>
                    <button id="btn-auto-answer-now" style="background:#e65100; color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px;">立即答题</button>
                </div>

                <div style="display:flex; gap:5px; margin-bottom:8px;">
                    <button id="btn-pull-errors" style="flex:1; background:#e67e22; color:#fff; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:bold;">拉取全量错题</button>
                    <button id="btn-scan-dom" style="flex:1; background:#16a085; color:#fff; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:bold;">扫描当前网页</button>
                </div>

                <textarea id="tk-log" style="width:100%;height:100px;font-size:11px;margin-bottom:10px;resize:vertical;background:#f8f9fa;border:1px solid #ddd;padding:5px;box-sizing:border-box;" readonly>☁️ 云端题库已就绪。\n</textarea>

                <div style="display:flex; gap:5px; margin-bottom:12px;">
                    <button id="btn-export-txt" style="background:#2980b9;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;flex:1;">导出 TXT</button>
                    <button id="btn-export-csv" style="background:#27ae60;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;flex:1;">导出 CSV</button>
                    <button id="btn-export-json" style="background:#8e44ad;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;flex:1;">导出 JSON</button>
                </div>

                <hr style="border:0; border-top:1px dashed #ccc; margin: 10px 0;">

                <div style="font-weight:bold; margin-bottom:5px; color:#c0392b;">☢️ 高级 API 测试与数据挖掘</div>
                <div style="font-size:11px; color:#7f8c8d; margin-bottom:8px;">测试接口漏洞，修改参数获取数据。拦截器会自动捕获成功的数据并贡献到云端。</div>

                <select id="tk-api-method" style="margin-bottom:5px; padding:3px;">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                </select>
                <input type="text" id="tk-api-url" placeholder="/api/student/xxx (接口路径)" style="width:100%; margin-bottom:5px; padding:4px; box-sizing:border-box;">
                <textarea id="tk-api-body" placeholder="POST请求的参数(可选)，如: id=xxx&userId=yyy" style="width:100%; height:40px; margin-bottom:5px; padding:4px; box-sizing:border-box; font-size:11px;"></textarea>

                <button id="btn-api-send" style="width:100%;background:#c0392b;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;font-weight:bold;margin-bottom:10px;">发送挖掘请求</button>

                <button id="btn-clear" style="width:100%;background:#7f8c8d;color:#fff;border:none;padding:5px;border-radius:4px;cursor:pointer;font-size:11px;">清空本地题库</button>
            </div>
        `;
        document.body.appendChild(panel);

        logArea = document.getElementById('tk-log');
        countSpan = document.getElementById('tk-count');

        // 事件绑定 - 原有功能
        document.getElementById('btn-export-txt').onclick = exportTXT;
        document.getElementById('btn-export-csv').onclick = exportCSV;
        document.getElementById('btn-export-json').onclick = exportJSON;
        document.getElementById('btn-clear').onclick = clearDB;
        document.getElementById('btn-pull-errors').onclick = autoPullErrors;
        document.getElementById('btn-scan-dom').onclick = scanDOMForQuestions;
        document.getElementById('btn-api-send').onclick = sendCustomApiRequest;

        // 事件绑定 - 云端功能
        document.getElementById('btn-cloud-upload').onclick = () => {
            const course = document.getElementById('tk-course').value.trim();
            uploadAllToCloud(course);
        };
        document.getElementById('btn-cloud-download').onclick = () => {
            const course = document.getElementById('tk-course').value.trim();
            downloadCloudToLocal(course);
        };
        document.getElementById('btn-cloud-refresh').onclick = () => fetchCloudIndex(true);
        document.getElementById('btn-auto-answer-now').onclick = () => {
            const course = document.getElementById('tk-course').value.trim();
            doAutoAnswer(course);
        };
        document.getElementById('tk-auto-answer').onchange = (e) => {
            CLOUD.autoAnswerEnabled = e.target.checked;
            log(`🎯 自动答题已${CLOUD.autoAnswerEnabled ? '开启' : '关闭'}`);
        };

        updateStats(getDB().length);
        fetchCloudIndex().then(() => updateCloudUI());

        // 拖拽
        const header = document.getElementById('tk-header');
        let isDragging = false, startX, startY, initialX, initialY;
        header.onmousedown = (e) => {
            isDragging = true; startX = e.clientX; startY = e.clientY;
            initialX = panel.offsetLeft; initialY = panel.offsetTop;
        };
        document.onmousemove = (e) => {
            if (!isDragging) return;
            panel.style.left = (initialX + e.clientX - startX) + 'px';
            panel.style.top = (initialY + e.clientY - startY) + 'px';
            panel.style.right = 'auto';
        };
        document.onmouseup = () => isDragging = false;

        // 初始启动题目监控
        setTimeout(() => {
            const course = document.getElementById('tk-course')?.value?.trim();
            if (course) watchForQuestions(course);
        }, 3000);
    }

    function updateCloudUI() {
        const el = document.getElementById('tk-cloud-courses');
        if (!el) return;
        if (cloudIndex) {
            el.textContent = `${cloudIndex.courses?.length || 0} 门 · ${Object.values(cloudIndex.count || {}).reduce((a,b)=>a+b,0) || 0} 题`;
        } else {
            el.textContent = '连接失败';
        }
    }

    function log(msg) {
        if(!logArea) return;
        logArea.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
        logArea.scrollTop = logArea.scrollHeight;
    }

    function updateStats(count) {
        if(countSpan) countSpan.innerText = count;
    }

    // ==========================================
    // 4. 导出逻辑
    // ==========================================
    function exportTXT() {
        const db = getDB();
        if(db.length === 0) return alert("题库为空！");
        let txtContent = "";
        db.forEach((q) => {
            txtContent += `【${q.type}】题目：${q.content}\n`;
            if ((q.type === "单选题" || q.type === "多选题") && q.options && q.options.length > 0) {
                q.options.forEach(opt => {
                    if (opt.alias && opt.text) txtContent += `${opt.alias}. ${opt.text}\n`;
                });
            }
            txtContent += `答案：${q.answer}\n\n`;
        });
        const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `党校题库_${db.length}题.txt`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        log(`导出 TXT 成功。`);
    }

    function exportJSON() {
        const db = getDB();
        if(db.length === 0) return alert("题库为空！");
        const blob = new Blob([JSON.stringify(db, null, 4)], { type: 'application/json;charset=utf-8' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `党校题库_${db.length}题.json`;
        link.click();
        log(`导出 JSON 成功。`);
    }

    function exportCSV() {
        const db = getDB();
        if(db.length === 0) return alert("题库为空！");
        let csvContent = "﻿题型,题目,选项,正确答案\n";
        db.forEach(q => {
            let optStr = q.options.map(o => `${o.alias}. ${o.text}`).join(" | ");
            csvContent += `"${q.type}","${q.content.replace(/"/g, '""')}","${optStr.replace(/"/g, '""')}","${String(q.answer).replace(/"/g, '""')}"\n`;
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `党校题库_${db.length}题.csv`;
        link.click();
        log(`导出 CSV 成功。`);
    }

    // ==========================================
    // 5. DOM 启发式扫描器
    // ==========================================
    function scanDOMForQuestions() {
        log("开始深度扫描当前网页元素...");
        let foundQuestions = [];
        const allElements = document.querySelectorAll('*');
        let rawDataSources = [];
        for (let el of allElements) {
            if (el.__vue__) {
                try {
                    let vueData = JSON.parse(JSON.stringify(el.__vue__.$data || {}));
                    rawDataSources.push(vueData);
                } catch(e){}
            }
        }
        if (rawDataSources.length > 0) {
            rawDataSources.forEach(data => {
                let extracted = extractQuestionsFromData(data);
                foundQuestions = foundQuestions.concat(extracted);
            });
        }
        if (foundQuestions.length > 0) {
            let added = saveToDB(foundQuestions);
            log(`DOM底层数据扫描完成，找到有效题目，新入库 ${added} 题！`);
            // 自动贡献到云端
            const course = document.getElementById('tk-course')?.value?.trim();
            if (course && added > 0) {
                contributeToCloud(course, foundQuestions);
            }
        } else {
            log("未能从当前页面的底层数据中扫描到规范题库。");
            log("提示：如果页面显示了题目，建议通过『高级API接口』重新请求该页面的数据源。");
        }
    }

    // ==========================================
    // 6. 高级 API 挖掘器
    // ==========================================
    async function sendCustomApiRequest() {
        let method = document.getElementById('tk-api-method').value;
        let url = document.getElementById('tk-api-url').value.trim();
        let body = document.getElementById('tk-api-body').value.trim();
        if (!url) return alert("请输入要挖掘的接口路径！");
        if (!url.startsWith('http')) {
            if (!url.startsWith('/')) url = '/' + url;
            url = window.location.origin + url;
        }
        log(`[挖掘机] 正在向 ${url} 发送 ${method} 请求...`);
        try {
            let options = {
                method: method,
                headers: {
                    "Accept": "application/json, text/plain, */*",
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
                }
            };
            if (method === 'POST' && body) options.body = body;
            let response = await fetch(url, options);
            if (!response.ok) { log(`[挖掘机] 请求失败，HTTP状态码: ${response.status}`); return; }
            let resJson = await response.json();
            let qList = extractQuestionsFromData(resJson);
            if (qList.length > 0) {
                let added = saveToDB(qList);
                log(`🎯 [挖掘机] 挖掘成功！发现 ${qList.length} 题，新入库 ${added} 题！`);
                // 自动贡献到云端
                const course = document.getElementById('tk-course')?.value?.trim();
                if (course && qList.length > 0) {
                    contributeToCloud(course, qList);
                }
            } else {
                log(`[挖掘机] 接口请求成功，但返回的数据中没有识别到题目特征。`);
                console.log("挖掘返回原始数据:", resJson);
            }
        } catch (e) {
            log(`❌ [挖掘机] 请求异常: ${e.message}`);
        }
    }

    // ==========================================
    // 7. 错题本自动拉取
    // ==========================================
    async function autoPullErrors() {
        log("开始全量拉取错题本...");
        const course = document.getElementById('tk-course')?.value?.trim();
        let current = 1; let totalPages = 1; let allRecords = [];
        while (current <= totalPages) {
            try {
                let res = await fetch("/api/student/test/myErrorQuestion/list", {
                    method: 'POST',
                    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
                    body: `current=${current}&size=100&keyword=`
                });
                let resJson = await res.json();
                if (resJson.code === 0 && resJson.data) {
                    totalPages = resJson.data.pages || 1;
                    let records = resJson.data.records || [];
                    if(records.length > 0){
                        allRecords = allRecords.concat(records);
                        let added = saveToDB(records);
                        log(`错题本第${current}页：新入库 ${added} 题。`);
                    } else break;
                } else break;
                current++;
                await new Promise(r => setTimeout(r, 600));
            } catch (e) { break; }
        }
        log("错题本全量拉取完成！");
        // 自动贡献到云端
        if (course && allRecords.length > 0) {
            const normQuestions = allRecords.map(r => normalizeQuestion(r)).filter(Boolean);
            contributeToCloud(course, normQuestions);
        }
    }

    // ==========================================
    // 8. 网络拦截双引擎（增强：自动贡献云端）
    // ==========================================
    const courseInput = () => document.getElementById('tk-course')?.value?.trim();

    // XHR 拦截
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        xhr.addEventListener('load', function() {
            try {
                if (this.responseURL && this.responseURL.includes('/api/')) {
                    let resData = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
                    if (resData) {
                        let qList = extractQuestionsFromData(resData);
                        let added = saveToDB(qList);
                        if (added > 0) {
                            log(`[XHR拦截] 自动抓取入库 ${added} 题。`);
                            const course = courseInput();
                            if (course) contributeToCloud(course, qList);
                        }
                    }
                }
            } catch (e) {}
        });
        return xhr;
    };

    // Fetch 拦截
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const cloneRes = response.clone();
        cloneRes.json().then(resData => {
            try {
                let url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
                if (url.includes('/api/')) {
                    let qList = extractQuestionsFromData(resData);
                    let added = saveToDB(qList);
                    if (added > 0) {
                        log(`[Fetch拦截] 自动抓取入库 ${added} 题。`);
                        const course = courseInput();
                        if (course) contributeToCloud(course, qList);
                    }
                }
            } catch(e) {}
        }).catch(() => {});
        return response;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPanel);
    } else {
        initPanel();
    }

})();
