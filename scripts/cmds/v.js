module.exports = {
  config: {
    name: "v",
    version: "4.0.0",
    author: "Amine (Alen) & Maestro",
    countDown: 2,
    role: 2,
    shortDescription: { en: "قفل الكنيات بقوة رهيبة (3 رادارات)" },
    category: "حماية",
    guide: {
      en: ".v → مسح\n" +
          ".v [كنية] → قفل الكل على هذي الكنية\n" +
          ".v [ID] [كنية] → قفل شخص معين\n" +
          ".v انا [كنية] → تغيير كنيتك\n" +
          ".v [ثواني] [كنية] → قفل مع تأخير\n" +
          ".v توقف → إيقاف كل شيء"
    }
  },

  _intervals: {}, // لتخزين الرادارات

  // تشغيل 3 رادارات قوية (كل 2 ثواني)
  startRadar(api, threadID) {
    if (this._intervals[threadID]) return;

    this._intervals[threadID] = [];

    for (let i = 1; i <= 3; i++) {  // 3 رادارات
      const interval = setInterval(async () => {
        try {
          const info = await api.getThreadInfo(threadID);
          const vvLock = global.GoatBot.vv_lock?.[threadID];
          const targetLocks = global.GoatBot.targetLocks?.[threadID] || {};

          if (!vvLock && Object.keys(targetLocks).length === 0) {
            this.stopRadar(threadID);
            return;
          }

          const botID = api.getCurrentUserID();
          const promises = info.participantIDs
            .filter(id => id !== botID && !global.config.adminBot?.includes(id))
            .map(async (id) => {
              try {
                // قفل عام
                if (vvLock) {
                  await api.changeNickname(vvLock, threadID, id);
                }
                // قفل شخص معين
                if (targetLocks[id]) {
                  await api.changeNickname(targetLocks[id], threadID, id);
                }
              } catch (e) {}
            });

          // تنفيذ محدود لتجنب الحظر
          await Promise.allSettled(promises.slice(0, 8));
        } catch (e) {}
      }, 2000); // كل 2 ثواني

      this._intervals[threadID].push(interval);
    }
  },

  stopRadar(threadID) {
    if (this._intervals[threadID]) {
      this._intervals[threadID].forEach(clearInterval);
      delete this._intervals[threadID];
    }
  },

  onStart: async function ({ api, event, args, message }) {
    const { threadID, senderID } = event;
    const input = args.join(" ").trim();

    global.GoatBot.vv_lock = global.GoatBot.vv_lock || {};
    global.GoatBot.targetLocks = global.GoatBot.targetLocks || {};

    // 1. مسح الكنية ( .v )
    if (!args[0] || args[0].toLowerCase() === "مسح") {
      await api.changeNickname("", threadID, senderID);
      return message.reply("🗑️ تم مسح كنيتك.");
    }

    // 2. إيقاف كل شيء
    if (args[0].toLowerCase() === "توقف" || args[0].toLowerCase() === "stop") {
      delete global.GoatBot.vv_lock[threadID];
      delete global.GoatBot.targetLocks[threadID];
      this.stopRadar(threadID);
      return message.reply("✅ تم إيقاف جميع أنظمة القفل والرادار.");
    }

    // 3. تغيير كنية المستخدم نفسه (.v انا ...)
    if (args[0].toLowerCase() === "انا") {
      const nick = args.slice(1).join(" ");
      if (!nick) return message.reply("💍 اكتب الكنية الجديدة.");
      await api.changeNickname(nick, threadID, senderID);
      return message.reply(`💍 تم تغيير كنيتك إلى: ${nick}`);
    }

    // 4. قفل شخص معين بالـ ID
    if (/^\d+$/.test(args[0])) {
      const targetID = args[0];
      const nick = args.slice(1).join(" ");
      if (!nick) return message.reply("💍 اكتب الكنية المراد فرضها.");

      global.GoatBot.targetLocks[threadID] = global.GoatBot.targetLocks[threadID] || {};
      global.GoatBot.targetLocks[threadID][targetID] = nick;

      await api.changeNickname(nick, threadID, targetID).catch(() => {});
      this.startRadar(api, threadID);

      return message.reply(`🔒 تم قفل الشخص [\( {targetID}] بالكنية:\n \){nick}\n(3 رادارات نشطة)`);
    }

    // 5. قفل الكل + دعم التأخير (ثواني)
    let nick = input;
    let delay = 0;

    // التحقق إذا أول كلمة رقم (ثواني)
    if (!isNaN(args[0]) && args.length > 1) {
      delay = parseInt(args[0]) * 1000;
      nick = args.slice(1).join(" ");
    }

    if (!nick) return message.reply("💍 اكتب الكنية.");

    global.GoatBot.vv_lock[threadID] = nick;

    message.reply(`⏳ جاري توحيد الكنيات...`);

    // تطبيق فوري
    const info = await api.getThreadInfo(threadID);
    const tasks = info.participantIDs.map(id => 
      () => api.changeNickname(nick, threadID, id).catch(() => {})
    );

    // تنفيذ متزامن
    for (let i = 0; i < tasks.length; i += 8) {
      await Promise.allSettled(tasks.slice(i, i + 8).map(t => t()));
      await new Promise(r => setTimeout(r, 300));
    }

    if (delay > 0) {
      setTimeout(() => this.startRadar(api, threadID), delay);
      return message.reply(`✅ تم التطبيق!\n🔒 القفل سينشط بعد ${args[0]} ثانية`);
    } else {
      this.startRadar(api, threadID);
      return message.reply(`✅ تم فرض الكنية: ${nick}\n🔒 3 رادارات قوية نشطة كل 2 ثواني`);
    }
  },

  onEvent: async function ({ api, event }) {
    const { threadID, logMessageType, logMessageData, author } = event;
    if (logMessageType !== "log:nickname") return;

    const participantID = logMessageData.participant_id;
    const botID = api.getCurrentUserID();

    if (author === botID || global.config.adminBot?.includes(author)) return;

    const vvNick = global.GoatBot.vv_lock?.[threadID];
    const targetNick = global.GoatBot.targetLocks?.[threadID]?.[participantID];

    if (vvNick || targetNick) {
      // محاولة استرجاع فورية + إعادة
      for (let i = 0; i < 3; i++) {
        try {
          await api.changeNickname(targetNick || vvNick, threadID, participantID);
          break;
        } catch (e) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
  }
};
