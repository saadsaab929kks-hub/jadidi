const axios = require('axios');

module.exports = {
  config: {
    name: "man",
    version: "3.0.0",
    role: 0,
    author: "Maestro & Assistant",
    description: "قراءة المانغا والمانهوا باللغة العربية والانجليزية مع نظام مكاتب متعددة",
    category: "media",
    guide: "{pn} [اسم المانغا بالعربي أو الإنجليزي] [رقم الفصل]\nمثال: .man ون بيس 1000\nأو .man lookism"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    
    if (args.length === 0) {
      return api.sendMessage("⚠️ الرجاء كتابة اسم المانغا. مثال: .man ون بيس 20", threadID, messageID);
    }

    let chapterNum = args.pop();
    let mangaName = args.join(" ");

    // إذا كان آخر عنصر ليس رقماً، فهذا يعني أن المستخدم أدخل اسم المانغا فقط بدون رقم الفصل
    if (isNaN(chapterNum)) {
      mangaName = mangaName ? `${mangaName} ${chapterNum}` : chapterNum;
      return searchAndListChapters(api, event, mangaName);
    }

    // قراءة فصل محدد
    return readChapter(api, event, mangaName, chapterNum);
  }
};

// الدالة الرئيسية للبحث وعرض نصف الفصول
async function searchAndListChapters(api, event, mangaName) {
  const { threadID, messageID } = event;
  try {
    api.sendMessage(`🔍 جاري البحث عن "${mangaName}" في المكتبة الأولى...`, threadID, messageID);

    // البحث في المكتبة الأولى (MangaDex)
    const searchRes = await axios.get(`https://api.mangadex.org/manga`, {
      params: { title: mangaName, limit: 1 }
    });

    // 🔄 إذا لم يجد المانغا في المكتبة الأولى، ينتقل تلقائياً للمكتبة البديلة
    if (searchRes.data.data.length === 0) {
      return searchInAlternativeAPI(api, event, mangaName);
    }

    const mangaId = searchRes.data.data[0].id;
    const mangaTitle = searchRes.data.data[0].attributes.title.ar || searchRes.data.data[0].attributes.title.en || Object.values(searchRes.data.data[0].attributes.title)[0];

    // جلب الفصول (يدعم العربية والإنجليزية معاً)
    const feedRes = await axios.get(`https://api.mangadex.org/manga/${mangaId}/feed`, {
      params: {
        translatedLanguage: ['ar', 'en'], // جلب المترجم عربي ثم انجليزي
        limit: 100,
        order: { chapter: 'desc' }
      }
    });

    let chapters = feedRes.data.data
      .filter(ch => ch.attributes.chapter)
      .sort((a, b) => parseFloat(b.attributes.chapter) - parseFloat(a.attributes.chapter));

    if (chapters.length === 0) {
      return api.sendMessage("❌ لم يتم العثور على فصول مترجمة لهذه المانغا في المكتبة الأولى.", threadID, messageID);
    }

    // تقسيم الفصول لعرض نصفها (بحد أقصى 25 في الرسالة الأولى)
    const half = Math.min(Math.ceil(chapters.length / 2), 25);
    const firstHalf = chapters.slice(0, half);

    let message = `📖 ${mangaTitle}\n\nالفصول المتوفرة (أحدث أولاً):\n\n`;

    firstHalf.forEach((ch, i) => {
      const chNum = ch.attributes.chapter;
      const lang = ch.attributes.translatedLanguage === 'ar' ? '🇸🇦' : '🇬🇧';
      const title = ch.attributes.title ? ` - ${ch.attributes.title}` : '';
      message += `${i+1}. الفصل ${chNum} ${lang}${title}\n`;
    });

    message += `\n\n لتكملة بقية الفصول اضغط: 1\n`;
    message += `لقراءة فصل معين: .man ${mangaName} [رقم الفصل]`;

    global.mangaCache = global.mangaCache || {};
    global.mangaCache[threadID] = { mangaId, mangaName, chapters, offset: half };

    return api.sendMessage(message, threadID, (err, info) => {
      if (!err) global.client.handleReply.push({
        name: "man",
        messageID: info.messageID,
        author: event.senderID,
        type: "list",
        mangaName,
        mangaId
      });
    });

  } catch (err) {
    console.error(err);
    return searchInAlternativeAPI(api, event, mangaName); // الانتقال للبديلة في حال حدوث خطأ شبكة
  }
}

// المكتبة البديلة في حال عدم وجود المانغا في الأولى
async function searchInAlternativeAPI(api, event, mangaName) {
  const { threadID, messageID } = event;
  api.sendMessage(`🔄 لم يتم العثور عليها في المكتبة الأولى، جاري البحث في المكتبة البديلة...`, threadID, messageID);
  
  try {
    // هنا يمكنك دمج رابط مكتبة أخرى مثل Consumet API أو نظام كشط لموقع عربي
    // كمثال مستقر، سنبحث في نظام المانغا المفتوح التابع لـ جيكان/أنمي ليست
    const altSearch = await axios.get(`https://api.jikan.moe/v4/manga`, {
      params: { q: mangaName, limit: 1 }
    });

    if (!altSearch.data.data || altSearch.data.data.length === 0) {
      return api.sendMessage("❌ عذراً، لم يتم العثور على هذه المانغا في جميع المكاتب المتوفرة.", threadID, messageID);
    }

    const manga = altSearch.data.data[0];
    let msg = `📖 تم العثور عليها في المكتبة البديلة:\n\n`;
    msg += ` الاسم: ${manga.title}\n`;
    msg += ` عدد الفصول المتوفرة: ${manga.chapters || 'غير محدد'}\n`;
    msg += ` النوع: ${manga.type}\n\n`;
    msg += ` لقراءة هذه المانغا، يرجى كتابة اسمها بالإنجليزية لتسهيل جلب الفصول المترجمة لجروبك.`;

    return api.sendMessage(msg, threadID, messageID);
  } catch (error) {
    return api.sendMessage("❌ عذراً، المانغا غير موجودة أو أن جميع المكاتب خارج الخدمة حالياً.", threadID, messageID);
  }
}

// دالة قراءة الفصل وتحميل الصور
async function readChapter(api, event, mangaName, chapterNum) {
  const { threadID, messageID } = event;
  try {
    api.sendMessage(`📖 جاري تحميل ${mangaName} - الفصل ${chapterNum}...`, threadID, messageID);

    const searchRes = await axios.get(`https://api.mangadex.org/manga`, {
      params: { title: mangaName, limit: 1 }
    });

    if (searchRes.data.data.length === 0) return api.sendMessage("❌ المانغا غير موجودة.", threadID, messageID);
    const mangaId = searchRes.data.data[0].id;

    const feedRes = await axios.get(`https://api.mangadex.org/manga/${mangaId}/feed`, {
      params: { 
        translatedLanguage: ['ar', 'en'], // البحث في الفصول العربية والانجليزية
        limit: 500,
        order: { chapter: 'desc' }
      }
    });

    // البحث عن الفصل المطلوب (يفضل النسخة العربية أولاً إن وجدت)
    const chaptersFound = feedRes.data.data.filter(ch => String(ch.attributes.chapter).trim() === String(chapterNum).trim());
    if (chaptersFound.length === 0) return api.sendMessage(`❌ الفصل ${chapterNum} غير موجود حالياً.`, threadID, messageID);
    
    // اختيار الفصل العربي إذا توفر، وإلا اختيار الإنجليزي
    const chapter = chaptersFound.find(ch => ch.attributes.translatedLanguage === 'ar') || chaptersFound[0];

    const server = await axios.get(`https://api.mangadex.org/at-home/server/${chapter.id}`);
    const hash = server.data.chapter.hash;
    const images = server.data.chapter.data.slice(0, 20); // جلب 20 صفحة لحماية البوت من الحظر

    const attachments = [];
    for (const img of images) {
      const url = `https://uploads.mangadex.org/data/${hash}/${img}`;
      try {
        const response = await axios.get(url, { responseType: 'stream' });
        attachments.push(response.data);
      } catch (e) {
        console.error("فشل تحميل صفحة:", e.message);
      }
    }

    const readLink = `https://mangadex.org/chapter/${chapter.id}`;
    const langFlag = chapter.attributes.translatedLanguage === 'ar' ? '🇸🇦 (عربي)' : '🇬🇧 (إنجليزي)';

    const body = `✅ ${mangaName} | الفصل ${chapterNum}\n` +
                 `🌐 لغة الفصل: ${langFlag}\n` +
                 `🖼️ تم تحميل ${attachments.length} صفحة للفيسبوك\n` +
                 `🔗 لمتابعة القراءة بالكامل: ${readLink}\n\n` +
                 ` للملف الجديد أو الفصل التالي اضغط: 1`;

    return api.sendMessage({ body, attachment: attachments }, threadID, (err, info) => {
      if (!err) global.client.handleReply.push({
        name: "man",
        messageID: info.messageID,
        author: event.senderID,
        type: "read",
        mangaName,
        chapterNum: parseFloat(chapterNum),
        mangaId
      });
    });

  } catch (err) {
    console.error(err);
    return api.sendMessage("⚠️ حدث خطأ أثناء تحميل صفحات الفصل.", threadID, messageID);
  }
}

// نظام الردود الذكي للجروبات (اضغط 1)
module.exports.onReply = async function ({ api, event, handleReply }) {
  const { threadID, messageID, body } = event;
  if (handleReply.author !== event.senderID) return;

  if (body.trim() === "1") {
    if (handleReply.type === "list") {
      const cache = global.mangaCache?.[threadID];
      if (!cache) return api.sendMessage("❌ انتهت الجلسة، يرجى كتابة الأمر من جديد.", threadID, messageID);

      const remaining = cache.chapters.slice(cache.offset);
      const nextBatch = remaining.slice(0, 25);

      if (nextBatch.length === 0) {
        return api.sendMessage("✅ تم عرض كافة الفصول المتوفرة.", threadID, messageID);
      }

      let msg = `📖 تكملة قائمة الفصول:\n\n`;
      nextBatch.forEach((ch, i) => {
        const lang = ch.attributes.translatedLanguage === 'ar' ? '🇸🇦' : '🇬🇧';
        msg += `${cache.offset + i + 1}. الفصل ${ch.attributes.chapter} ${lang}\n`;
      });

      cache.offset += nextBatch.length;
      
      if (cache.chapters.length > cache.offset) {
          msg += `\n\n لتكملة اضغط: 1\n`;
      }
      msg += `لقراءة فصل محدد: .man ${handleReply.mangaName} [الرقم]`;

      return api.sendMessage(msg, threadID, (err, info) => {
        if (!err && cache.chapters.length > cache.offset) {
          global.client.handleReply.push({
            name: "man",
            messageID: info.messageID,
            author: event.senderID,
            type: "list",
            mangaName: handleReply.mangaName,
            mangaId: handleReply.mangaId
          });
        }
      });

    } else if (handleReply.type === "read") {
      // الانتقال للفصل التالي تلقائياً عند الضغط على 1 بعد القراءة
      const nextChapterNum = handleReply.chapterNum + 1;
      api.sendMessage(`⏭️ جاري الانتقال تلقائياً إلى الفصل الجديد ${nextChapterNum}...`, threadID, messageID);
      return readChapter(api, event, handleReply.mangaName, nextChapterNum);
    }
  }
};
