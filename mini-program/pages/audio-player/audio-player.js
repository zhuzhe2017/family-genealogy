/**
 * 听书播放器（识典古籍对标 · 阶段 4）
 *
 * 跳转契约（冻结，与 reader 页面呼应）：
 *   familyId   必填
 *   chapterId  可选  若有则调用 synthesizeChapter 自动取章节正文合成
 *   text       可选  直接合成传入的文本（优先 chapterId）
 *   title      可选  展示标题
 *   voice      可选  音色
 *
 * 播放能力：
 *   - 微信 backgroundAudioManager（后台播放）
 *   - 倍速：0.5x / 1.0x / 1.25x / 1.5x / 2.0x
 *   - 定时关闭：15 / 30 / 60 分钟
 *   - 自动记录最后播放位置（storage 持久化）
 */
const api = require('../../utils/api.js');

const POS_KEY = 'audio_pos_'; // + chapterId or md5(text)

Page({
  data: {
    familyId: null,
    chapterId: null,
    title: '',
    voice: '',
    voices: [],

    synthesizing: false,  // 合成中
    loading: false,        // 音频加载中
    playing: false,
    currentTime: 0,
    duration: 0,
    currentTimeText: '00:00',
    durationText: '00:00',
    rate: 1.0,
    rates: [0.5, 1.0, 1.25, 1.5, 2.0],
    rateIndex: 1,
    timerMinutes: 0,      // 定时关闭，0 = 不启用
    timerPresets: [0, 15, 30, 60],
    timerDisplay: '',

    audioUrl: ''
  },

  // ============ backgroundAudioManager ============
  bam: null,
  timerHandle: null,
  _lastPosition: 0,

  onLoad: function (query) {
    const familyId = query.familyId ? Number(query.familyId) : this.getCurrentFamilyId();
    const chapterId = query.chapterId ? Number(query.chapterId) : null;
    const text = query.text || '';
    const title = query.title || (chapterId ? '章节 ' + chapterId : '听书');
    const voice = query.voice || '';

    if (!familyId) {
      wx.showToast({ title: '请先绑定家族', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }

    this.setData({ familyId, chapterId, title, voice });
    wx.setNavigationBarTitle({ title: '听书 · ' + title.slice(0, 14) });

    // 初始化 backgroundAudioManager
    this.bam = wx.getBackgroundAudioManager();
    this.bindBamEvents();

    // 载入音色列表 + 开始合成
    this.loadVoices();

    if (chapterId) {
      this.loadOrSynthesizeChapter();
    } else if (text) {
      this.synthesizeText(text);
    } else {
      wx.showToast({ title: '缺少章节或文本', icon: 'none' });
    }

    // 恢复上次播放位置
    this.restorePosition();
  },

  onUnload: function () {
    this.savePosition();
    if (this.timerHandle) { clearTimeout(this.timerHandle); this.timerHandle = null; }
    if (this.bam) { try { this.bam.stop(); } catch {} }
  },

  // ============ BAM 事件绑定 ============
  bindBamEvents: function () {
    this.bam.onPlay(() => this.setData({ playing: true }));
    this.bam.onPause(() => this.setData({ playing: false }));
    this.bam.onStop(() => this.setData({ playing: false }));
    this.bam.onEnded(() => {
      this.setData({ playing: false, currentTime: this.data.duration });
      wx.showToast({ title: '播放结束', icon: 'none' });
    });
    this.bam.onError((err) => {
      this.setData({ playing: false, loading: false });
      wx.showToast({ title: '播放错误: ' + (err.errMsg || ''), icon: 'none' });
    });
    this.bam.onCanplay(() => {
      this.setData({ loading: false });
      // 首次触发，尝试读取 duration
      setTimeout(() => {
        try {
          const d = this.bam.duration;
          if (d && !isNaN(d)) this.setData({
            duration: Math.round(d),
            durationText: this.formatTime(Math.round(d))
          });
        } catch {}
      }, 500);
    });
    this.bam.onTimeUpdate(() => {
      try {
        const t = this.bam.currentTime;
        if (!isNaN(t)) this.setData({
          currentTime: Math.round(t),
          currentTimeText: this.formatTime(Math.round(t))
        });
      } catch {}
    });
  },

  // ============ 合成 ============
  loadVoices: function () {
    api.tts.getVoices().then(res => {
      this.setData({ voices: res.data || [] });
      if (!this.data.voice && res.data && res.data.length > 0) {
        this.setData({ voice: res.data[0].name });
      }
    }).catch(() => {
      // 不阻塞主流程
    });
  },

  loadOrSynthesizeChapter: function () {
    const fid = this.data.familyId;
    const cid = this.data.chapterId;

    // 先查缓存
    this.setData({ loading: true });
    api.tts.getChapterAudio(fid, cid).then(res => {
      if (res.data && res.data.hit && res.data.audioUrl) {
        // 缓存命中 → 直接播放
        const dur = res.data.duration_sec || 0;
        this.setData({ audioUrl: res.data.audioUrl, duration: dur, durationText: this.formatTime(dur) });
        this.play();
      } else {
        // 未命中 → 合成
        this.synthesizeChapter();
      }
    }).catch(() => {
      this.synthesizeChapter();
    });
  },

  synthesizeChapter: function () {
    const fid = this.data.familyId;
    const cid = this.data.chapterId;
    this.setData({ synthesizing: true, loading: true });
    api.tts.synthesizeChapter(fid, cid, { voice: this.data.voice || undefined })
      .then(res => {
        const r = res.data || res;
        this.setData({
          synthesizing: false,
          audioUrl: r.audioUrl,
          duration: r.durationSec || 0,
          durationText: this.formatTime(r.durationSec || 0)
        });
        this.play();
      })
      .catch(err => {
        this.setData({ synthesizing: false, loading: false });
        this.handleTtsError(err);
      });
  },

  synthesizeText: function (text) {
    this.setData({ synthesizing: true, loading: true });
    api.tts.synthesize(this.data.familyId, { text, voice: this.data.voice || undefined })
      .then(res => {
        const r = res.data || res;
        this.setData({
          synthesizing: false,
          audioUrl: r.audioUrl,
          duration: r.durationSec || 0,
          durationText: this.formatTime(r.durationSec || 0)
        });
        this.play();
      })
      .catch(err => {
        this.setData({ synthesizing: false, loading: false });
        this.handleTtsError(err);
      });
  },

  handleTtsError: function (err) {
    const msg = err && err.msg ? err.msg : '合成失败';
    wx.showModal({
      title: '听书不可用',
      content: msg + '\n\nTTS 听书为会员专属权益，家族版及以上套餐可享。',
      showCancel: false
    });
  },

  // ============ 播放控制 ============
  play: function () {
    if (!this.data.audioUrl) return;
    this.bam.src = this.data.audioUrl;
    this.bam.title = this.data.title;
    this.bam.epname = this.data.title;
    this.bam.singer = 'AI 听书';
    this.bam.playbackRate = this.data.rate;
    this.bam.play();
  },

  pause: function () { this.bam.pause(); },

  togglePlay: function () {
    if (this.data.playing) this.pause(); else this.play();
  },

  // ============ 倍速切换 ============
  onRateTap: function (e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const r = this.data.rates[idx];
    this.setData({ rateIndex: idx, rate: r });
    if (this.bam) this.bam.playbackRate = r;
  },

  // ============ 进度条 ============
  onSeek: function (e) {
    const pct = Number(e.detail.value);
    const t = Math.round((pct / 100) * this.data.duration);
    try { this.bam.seek(t); } catch {}
    this.setData({ currentTime: t });
  },

  // ============ 定时关闭 ============
  onTimerTap: function (e) {
    const min = Number(e.currentTarget.dataset.min);
    if (this.timerHandle) { clearTimeout(this.timerHandle); this.timerHandle = null; }
    this.setData({ timerMinutes: min, timerDisplay: min === 0 ? '' : min + ' 分钟后关闭' });
    if (min > 0) {
      const ms = min * 60 * 1000;
      this.timerHandle = setTimeout(() => {
        try { this.bam.stop(); } catch {}
        wx.showToast({ title: '定时关闭', icon: 'none' });
      }, ms);
    }
  },

  // ============ 位置持久化 ============
  restorePosition: function () {
    try {
      const key = POS_KEY + (this.data.chapterId || this.data.title);
      const pos = wx.getStorageSync(key);
      if (pos && pos > 0) this._lastPosition = pos;
    } catch {}
  },
  savePosition: function () {
    try {
      const pos = this.bam ? Math.round(this.bam.currentTime || 0) : this.data.currentTime;
      const key = POS_KEY + (this.data.chapterId || this.data.title);
      wx.setStorageSync(key, pos);
    } catch {}
  },

  // ============ 工具 ============
  getCurrentFamilyId: function () {
    try { const info = wx.getStorageSync('currentFamily'); return info ? Number(info.id) : null; }
    catch { return null; }
  },
  formatTime: function (sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
});
