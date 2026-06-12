module.exports = {
  config: {
    name: "x",
    version: "2.0.0",
    author: "Amin & Maestro",
    role: 2,
    category: "system",
    guide: {
      en: ".x [الاسم الجديد] → تثبيت الاسم + الصورة\n" +
          ".x off → إيقاف الحماية"
    }
  },

  _intervals: {},

  // تشغيل 3 رادارات قوية
  startRadar(api, threadID) {
    if (this._intervals[threadID]) return;

    this._intervals[threadID] = [];

    for (let i = 1; i <= 3; i++) {
      const interval = setInterval(async () => {
        try {
          const lock = global.xSystem?.[threadID];
          if (!lock?.status) {
            this.stopRadar(threadID);
            return;
          }

          const info = await api.getThreadInfo(threadID);
          if (!info) return;

          // إعادة تثبيت الاسم
          if (info.threadName !== lock.name) {
            api.setTitle(lock.name, threadID).catch(() => {});
          }

          // إعادة تثبيت الصورة
          if (lock.image && info.image !== lock.image) {  // مقارنة بسيطة
            const stream = (await axios.get(lock.image, { responseType: 'stream' })).data;
            api.changeGroupImage(stream, threadID).catch(() => {});
          }
        } catch (e) {}
      }, 2000); // كل 2 ثواني
    }

    this._intervals[threadID].push(interval);
  },

  stopRadar(threadID) {
    if (this._intervals[threadID]) {
      this._intervals[threadID].forEach(clearInterval);
      delete this._intervals[threadID];
    }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, senderID } = event;
    const myUID = "61578796876651";

    if (senderID !== myUID) return;

    if (!global.xSystem) global.xSystem = {};

    // إيقاف الحماية
    if (args[0] === "off") {
      global.xSystem[threadID] = { status: false, name: "", image: "" };
      this.stopRadar(threadID);
      return api.sendMessage("🔓 تم إيقاف حماية اسم وصورة المجموعة.", threadID);
    }

    const newName = args.join(" ");
    if (!newName) {
      return api.sendMessage("⚠️ اكتب الاسم الجديد: .x [الاسم]", threadID);
    }

    // جلب معلومات المجموعة الحالية
    const threadInfo = await api.getThreadInfo(threadID);
    let imageUrl = "";

    // حفظ رابط الصورة الحالية إن وجدت
    if (threadInfo.image) {
      imageUrl = threadInfo.image; // رابط الصورة
    }

    // حفظ الإعدادات
    global.xSystem[threadID] = {
      status: true,
      name: newName,
      image: imageUrl
    };

    // تطبيق فوري
    api.setTitle(newName, threadID, async (err) => {
      if (err) {
        return api.sendMessage("❌ فشل تغيير الاسم. تأكد أن البوت أدمن.", threadID);
      }

      // تثبيت الصورة إذا وجدت
      if (imageUrl) {
        try {
          const stream = (await axios.get(imageUrl, { responseType: 'stream' })).data;
          await api.changeGroupImage(stream, threadID);
        } catch (e) {}
      }

      api.sendMessage(`🛡️ تم تثبيت الحماية بنجاح!\n\n` +
                      `📛 الاسم: ${newName}\n` +
                      `🖼️ الصورة: ${imageUrl ? "مثبتة" : "غير موجودة"}\n\n` +
                      `🔒 3 رادارات نشطة كل 2 ثواني`, threadID);

      this.startRadar(api, threadID);
    });
  },

  // مراقبة فورية (onEvent)
  onEvent: async function ({ api, event }) {
    const { threadID, logMessageType, logMessageData } = event;
    const lock = global.xSystem?.[threadID];

    if (!lock?.status) return;

    // تغيير الاسم
    if (logMessageType === "log:thread-name") {
      const newName = logMessageData.name;
      if (newName !== lock.name) {
        for (let i = 0; i < 3; i++) {  // 3 محاولات
          try {
            await api.setTitle(lock.name, threadID);
            break;
          } catch (e) {
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
    }

    // تغيير الصورة
    if (logMessageType === "log:thread-image") {
      if (lock.image) {
        for (let i = 0; i < 3; i++) {
          try {
            const stream = (await axios.get(lock.image, { responseType: 'stream' })).data;
            await api.changeGroupImage(stream, threadID);
            break;
          } catch (e) {
            await new Promise(r => setTimeout(r, 400));
          }
        }
      }
    }
  }
};
