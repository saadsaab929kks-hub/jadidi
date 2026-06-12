const axios = require('axios');

module.exports = {
  config: {
    name: "man",
    version: "2.3.0",
    role: 0,
    author: "Maestro (modified)",
    description: "قراءة المانغا والمانهوا مع قائمة فصول وتكملة (20 صفحة)",
    category: "media",
    guide: "{pn} [اسم المانغا] [رقم الفصل]\nمثال: .man lookism\nأو .man lookism 400"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    
    let chapterNum = args.pop();
    let mangaName = args.join(" ");

    // إذا لم يدخل رقم الفصل → عرض قائمة الفصول (نصفها تقريباً مع خيار التكملة)
    if (!mangaName || isNaN(chapterNum)) {
      if (!mangaName) mangaName = chapterNum; // في حال ما دخلش رقم
      return searchAndListChapters(api, event, mangaName);
    }

    // قراءة فصل محدد
    return readChapter(api, event, mangaName, chapterNum);
  }
};

// دالة البحث وعرض نصف الفصول (مع خيار تكملة)
async function searchAndListChapters(api, event, mangaName) {
  const { threadID, messageID } = event;
  try {
    api.sendMessage(`🔍 جاري البحث عن ${mangaName}...`, threadID, messageID);

    const searchRes = await axios.get(`https://api.mangadex.org/manga`, {
      params: { title: mangaName, limit: 1 }
    });

    if (searchRes.data.data.length === 0) {
      return api.sendMessage("❌ لم يتم العثور على هذه المانغا.", threadID, messageID);
    }

    const mangaId = searchRes.data.data[0].id;
    const mangaTitle = searchRes.data.data[0].attributes.title.en || Object.values(searchRes.data.data[0].attributes.title)[0];

    // جلب كل الفصول (مع دعم offset للصفحات)
    const feedRes = await axios.get(`https://api.mangadex.org/manga/${mangaId}/feed`, {
      params: {
        translatedLanguage: ['en'],
        limit: 100,     // أكبر عدد ممكن
        order: { chapter: 'desc' }  // أحدث أولاً
      }
    });

    let chapters = feedRes.data.data
      .filter(ch => ch.attributes.chapter) // فصل له رقم
      .sort((a, b) => parseFloat(b.attributes.chapter) - parseFloat(a.attributes.chapter));

    if (chapters.length === 0) {
      return api.sendMessage("❌ لم يتم العثور على فصول مترجمة.", threadID, messageID);
    }

    // نصف الفصول تقريباً (أو 25 فصل كحد أقصى لكل رسالة)
    const half = Math.min(Math.ceil(chapters.length / 2), 25);
    const firstHalf = chapters.slice(0, half);

    let message = `📖 ${mangaTitle}\n\nالفصول المتوفرة (أحدث أولاً):\n\n`;

    firstHalf.forEach((ch, i) => {
      const chNum = ch.attributes.chapter;
      const title = ch.attributes.title ? ` - ${ch.attributes.title}` : '';
      message += `${i+1}. الفصل \( {chNum} \){title}\n`;
    });

    message += `\n\nلعرض التكملة (الفصول التالية) اضغط: 1\n`;
    message += `لقراءة فصل معين: .man ${mangaName} [رقم الفصل]`;

    // حفظ معلومات المانغا مؤقتاً (يمكن تحسينه بـ global map أو database لاحقاً)
    global.mangaCache = global.mangaCache || {};
    global.mangaCache[threadID] = { mangaId, mangaName: mangaName, chapters, offset: half };

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
    return api.sendMessage("⚠️ خطأ أثناء جلب الفصول.", threadID, messageID);
  }
}

// قراءة فصل محدد
async function readChapter(api, event, mangaName, chapterNum) {
  const { threadID, messageID } = event;
  try {
    api.sendMessage(`📖 جاري تحميل ${mangaName} - الفصل ${chapterNum}...`, threadID, messageID);

    const searchRes = await axios.get(`https://api.mangadex.org/manga`, {
      params: { title: mangaName, limit: 1 }
    });

    if (searchRes.data.data.length === 0) return api.sendMessage("❌ مانغا غير موجودة.", threadID, messageID);
    const mangaId = searchRes.data.data[0].id;

    const feedRes = await axios.get(`https://api.mangadex.org/manga/${mangaId}/feed`, {
      params: { 
        translatedLanguage: ['en'], 
        limit: 500,
        order: { chapter: 'desc' }
      }
    });

    // البحث عن الفصل (دعم أفضل)
    const chapter = feedRes.data.data.find(ch => 
      String(ch.attributes.chapter).trim() === String(chapterNum).trim()
    );

    if (!chapter) return api.sendMessage(`❌ الفصل ${chapterNum} غير موجود.`, threadID, messageID);

    const server = await axios.get(`https://api.mangadex.org/at-home/server/${chapter.id}`);
    const hash = server.data.chapter.hash;
    const images = server.data.chapter.data.slice(0, 20); // 20 صفحة

    const attachments = [];
    for (const img of images) {
      const url = `https://uploads.mangadex.org/data/\( {hash}/ \){img}`;
      try {
        const response = await axios.get(url, { responseType: 'stream' });
        attachments.push(response.data);
      } catch (e) {
        console.error("فشل تحميل صورة:", e.message);
      }
    }

    const readLink = `https://mangadex.org/chapter/${chapter.id}`;

    const body = `✅ ${mangaName} | الفصل ${chapterNum}\n` +
                 `🖼️ ${images.length} صفحة (محدود لفيسبوك)\n` +
                 `🔗 كمل القراءة هنا: ${readLink}\n\n` +
                 `للتكملة (الصفحات التالية أو الفصل التالي) اضغط: 1`;

    return api.sendMessage({ body, attachment: attachments }, threadID, (err, info) => {
      if (!err) global.client.handleReply.push({
        name: "man",
        messageID: info.messageID,
        author: event.senderID,
        type: "read",
        mangaName,
        chapterNum: parseFloat(chapterNum),
        mangaId,
        currentChapterId: chapter.id
      });
    });

  } catch (err) {
    console.error(err);
    return api.sendMessage("⚠️ حدث خطأ، حاول مرة أخرى.", threadID, messageID);
  }
}

// معالجة الردود (لتكملة القائمة أو الفصل)
module.exports.onReply = async function ({ api, event, handleReply }) {
  const { threadID, messageID, body } = event;
  if (handleReply.author !== event.senderID) return;

  const replyType = handleReply.type;

  if (body.trim() === "1") {
    if (replyType === "list") {
      // تكملة قائمة الفصول
      const cache = global.mangaCache?.[threadID];
      if (!cache) return api.sendMessage("انتهت الجلسة، ابدأ بحث جديد.", threadID, messageID);

      const remaining = cache.chapters.slice(cache.offset);
      const nextBatch = remaining.slice(0, 25);

      if (nextBatch.length === 0) {
        return api.sendMessage("✅ هذه آخر الفصول.", threadID, messageID);
      }

      let msg = `📖 تكملة الفصول:\n\n`;
      nextBatch.forEach((ch, i) => {
        msg += `${cache.offset + i + 1}. الفصل ${ch.attributes.chapter}\n`;
      });

      msg += `\n\nللمزيد اضغط 1\nأو استخدم .man ${handleReply.mangaName} [رقم]`;

      cache.offset += nextBatch.length;

      return api.sendMessage(msg, threadID, (err, info) => {
        if (!err) global.client.handleReply.push({
          name: "man",
          messageID: info.messageID,
          author: event.senderID,
          type: "list",
          mangaName: handleReply.mangaName,
          mangaId: handleReply.mangaId
        });
      });

    } else if (replyType === "read") {
      // تكملة الفصل (الصفحات التالية) أو الفصل التالي
      const nextChapterNum = handleReply.chapterNum + 1;
      api.sendMessage(`⏭️ جاري الانتقال إلى الفصل ${nextChapterNum}...`, threadID, messageID);
      return readChapter(api, event, handleReply.mangaName, nextChapterNum);
    }
  }
};
