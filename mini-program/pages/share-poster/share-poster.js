const app = getApp();
const { invitation } = require('../../utils/api');
const { resolveImageUrl } = require('../../utils/format');
const { getToken } = require('../../utils/request');

// 海报逻辑尺寸（px，输出时按 dpr 放大）
const POSTER_W = 375;
const POSTER_H = 560;

// 自定义海报样式预设
const POSTER_STYLES = {
  red: {
    name: '中国红',
    bgTop: '#7A1414',
    bgBottom: '#B8452C',
    accent: '#FFD700',
    titleColor: '#FFFFFF',
    subColor: 'rgba(255,255,255,0.85)',
    boxBg: 'rgba(255,255,255,0.12)',
    boxBorder: '#FFD700',
    labelColor: 'rgba(255,255,255,0.75)'
  },
  gold: {
    name: '鎏金',
    bgTop: '#5C3A1E',
    bgBottom: '#8B6A3F',
    accent: '#FFE9A8',
    titleColor: '#FFFFFF',
    subColor: 'rgba(255,255,255,0.85)',
    boxBg: 'rgba(255,255,255,0.12)',
    boxBorder: '#FFE9A8',
    labelColor: 'rgba(255,255,255,0.75)'
  },
  blue: {
    name: '雅蓝',
    bgTop: '#1F3A5F',
    bgBottom: '#2E5E8C',
    accent: '#9CC8F0',
    titleColor: '#FFFFFF',
    subColor: 'rgba(255,255,255,0.85)',
    boxBg: 'rgba(255,255,255,0.12)',
    boxBorder: '#9CC8F0',
    labelColor: 'rgba(255,255,255,0.75)'
  },
  green: {
    name: '墨绿',
    bgTop: '#2F5233',
    bgBottom: '#3E7A45',
    accent: '#CFE8A0',
    titleColor: '#FFFFFF',
    subColor: 'rgba(255,255,255,0.85)',
    boxBg: 'rgba(255,255,255,0.12)',
    boxBorder: '#CFE8A0',
    labelColor: 'rgba(255,255,255,0.75)'
  }
};

Page({
  data: {
    code: '',
    info: null,
    style: 'red',
    styleOptions: Object.keys(POSTER_STYLES).map((key) => ({ key, ...POSTER_STYLES[key] })),
    drawing: true,
    posterPath: ''
  },

  onLoad(options) {
    // 兼容两种进入方式：
    // 1. 链接/分享卡片: ?code=ABC12345
    // 2. 扫描海报小程序码: scene=code=ABC12345（getwxacodeunlimit 的 scene 参数为 query 串，需解析出 code）
    let raw = String(options.code || options.scene || '').trim();
    if (!options.code && options.scene) {
      const m = raw.match(/code=([A-Za-z0-9]+)/);
      if (m) raw = m[1];
    }
    const code = raw.toUpperCase();
    if (!code) {
      wx.showToast({ title: '邀请码不能为空', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    const style = POSTER_STYLES[options.style] ? options.style : 'red';
    this.setData({ code, style });

    if (!getToken()) {
      wx.navigateTo({ url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/share-poster/share-poster?code=' + code) });
      return;
    }
    this.loadInfo();
  },

  /** 加载邀请信息（家族信息/小程序码/计数） */
  loadInfo() {
    invitation.getInfoByCode(this.data.code)
      .then((info) => {
        this.setData({ info, drawing: true });
        // 等 canvas 渲染完成再绘制
        setTimeout(() => this.drawPoster(), 100);
      })
      .catch((err) => {
        this.setData({ drawing: false });
        wx.showToast({ title: err.message || '邀请信息加载失败', icon: 'none', duration: 2500 });
        setTimeout(() => wx.navigateBack(), 1500);
      });
  },

  // ==================== 海报绘制（Canvas 2D） ====================

  drawPoster() {
    const query = this.createSelectorQuery();
    query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        wx.showToast({ title: '海报绘制失败', icon: 'none' });
        return;
      }
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = (wx.getSystemInfoSync().pixelRatio || 2);
      canvas.width = POSTER_W * dpr;
      canvas.height = POSTER_H * dpr;
      ctx.scale(dpr, dpr);

      this._canvas = canvas;
      this._ctx = ctx;
      this.renderPoster();
    });
  },

  /** 加载海报所需图片后绘制 */
  async renderPoster() {
    const canvas = this._canvas;
    const ctx = this._ctx;
    const info = this.data.info || {};
    const logoUrl = resolveImageUrl(info.familyLogo || '');
    const qrUrl = resolveImageUrl(info.qrCodeUrl || '');
    const [logoImg, qrImg] = await Promise.all([
      logoUrl ? this.loadImage(canvas, logoUrl) : Promise.resolve(null),
      qrUrl ? this.loadImage(canvas, qrUrl) : Promise.resolve(null)
    ]);
    this._logoImg = logoImg;
    this._qrImg = qrImg;
    this.paintPoster(ctx, info);
    this.exportPoster();
  },

  /** 加载图片（失败返回 null，不中断绘制） */
  loadImage(canvas, url) {
    return new Promise((resolve) => {
      const img = canvas.createImage();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  },

  /** 核心绘制逻辑 */
  paintPoster(ctx, info) {
    const W = POSTER_W;
    const H = POSTER_H;
    const style = POSTER_STYLES[this.data.style] || POSTER_STYLES.red;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // 1. 背景渐变
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, style.bgTop);
    grad.addColorStop(1, style.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 2. 装饰圆
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(28, 44, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W - 16, 96, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(40, H - 60, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. 外框虚线
    this.roundRect(ctx, 12, 12, W - 24, H - 24, 16);
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. 顶部小字
    ctx.fillStyle = style.labelColor;
    ctx.font = '12px sans-serif';
    ctx.fillText('I N V I T A T I O N', W / 2, 46);

    // 5. 家族头像（圆形裁剪）
    const avX = W / 2;
    const avY = 122;
    const avR = 44;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (this._logoImg) {
      ctx.drawImage(this._logoImg, avX - avR, avY - avR, avR * 2, avR * 2);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
      ctx.fillStyle = style.accent;
      ctx.font = 'bold 42px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.firstChar(info.familyName || '族'), avX, avY);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    // 头像描边
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avR + 3, 0, Math.PI * 2);
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 6. 家族名称
    ctx.fillStyle = style.titleColor;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(info.familyName || '家族', W / 2, 208);

    // 7. 家族关键信息（始祖/发源地）
    const sub = [info.founder ? '始祖：' + info.founder : '', info.origin ? '发源地：' + info.origin : '']
      .filter(Boolean)
      .join(' · ');
    ctx.fillStyle = style.subColor;
    ctx.font = '13px sans-serif';
    ctx.fillText(sub || '以家族之名，共续血脉之缘', W / 2, 240);

    // 8. 唯一识别码（邀请码）虚线框
    const bx = 70;
    const by = 262;
    const bw = W - 140;
    const bh = 64;
    const br = 12;
    this.roundRect(ctx, bx, by, bw, bh, br);
    ctx.fillStyle = style.boxBg;
    ctx.fill();
    this.roundRect(ctx, bx, by, bw, bh, br);
    ctx.strokeStyle = style.boxBorder;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = style.labelColor;
    ctx.font = '12px sans-serif';
    ctx.fillText('专属邀请码', W / 2, by + 24);

    const code = (this.data.code || '------').toUpperCase();
    // 邀请码文本：以 measureText 实测宽度，超出虚线框时自动缩小字号，保证不超出区域
    const codeText = code.split('').join('  ');
    const codeBoxPad = 16; // 框内左右留白
    const maxCodeWidth = bw - codeBoxPad * 2;
    let codeFontSize = 24;
    ctx.font = `bold ${codeFontSize}px monospace`;
    let codeWidth = ctx.measureText(codeText).width;
    if (codeWidth > maxCodeWidth) {
      codeFontSize = Math.max(14, Math.floor((codeFontSize * maxCodeWidth) / codeWidth));
      ctx.font = `bold ${codeFontSize}px monospace`;
    }
    ctx.fillStyle = style.accent;
    ctx.fillText(codeText, W / 2, by + 54);

    // 9. 小程序码（扫码加入）
    if (this._qrImg) {
      const qrSize = 108;
      const qrX = W / 2 - qrSize / 2;
      const qrY = 350;
      this.roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.drawImage(this._qrImg, qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = style.labelColor;
      ctx.font = '12px sans-serif';
      ctx.fillText('长按识别小程序码 · 立即加入家族', W / 2, qrY + qrSize + 26);
    } else {
      ctx.fillStyle = style.labelColor;
      ctx.font = '13px sans-serif';
      ctx.fillText('复制上方邀请码，微信内即可加入家族', W / 2, 406);
    }

    // 10. 邀请人
    ctx.fillStyle = style.labelColor;
    ctx.font = '12px sans-serif';
    ctx.fillText('—— 邀请人：' + (info.inviterNickname || '家族成员'), W / 2, H - 30);
  },

  /** 导出海报临时文件并预览 */
  exportPoster() {
    const canvas = this._canvas;
    if (!canvas) return;
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: POSTER_W,
      height: POSTER_H,
      destWidth: POSTER_W * 2,
      destHeight: POSTER_H * 2,
      fileType: 'png',
      success: (res) => {
        this.setData({ posterPath: res.tempFilePath, drawing: false });
      },
      fail: () => {
        this.setData({ drawing: false });
        wx.showToast({ title: '海报生成失败', icon: 'none' });
      }
    });
  },

  // ==================== 样式切换 ====================

  switchStyle(e) {
    const style = e.currentTarget.dataset.style;
    if (!style || style === this.data.style) return;
    this.setData({ style, posterPath: '', drawing: true });
    // 等 canvas 重新渲染后再绘制
    setTimeout(() => this.drawPoster(), 100);
  },

  // ==================== 分享 / 保存 ====================

  savePoster() {
    if (this.data.posterPath) {
      this.saveToAlbum(this.data.posterPath);
      return;
    }
    this.exportPoster();
    setTimeout(() => {
      if (this.data.posterPath) this.saveToAlbum(this.data.posterPath);
    }, 500);
  },

  saveToAlbum(path) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => {
        wx.showToast({ title: '海报已保存到相册', icon: 'success' });
        invitation.recordShare(this.data.code).catch(() => {});
      },
      fail: (err) => this.handleSaveFail(err)
    });
  },

  handleSaveFail(err) {
    const msg = (err && err.errMsg) || '';
    if (msg.indexOf('auth deny') > -1 || msg.indexOf('authorize') > -1) {
      wx.showModal({
        title: '需要相册权限',
        content: '请在设置中开启"保存到相册"权限后重试',
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) wx.openSetting();
        }
      });
    } else {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  copyCode() {
    wx.setClipboardData({
      data: this.data.code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    });
  },

  copyLink() {
    wx.setClipboardData({
      data: 'pages/invite-accept/invite-accept?code=' + this.data.code,
      success: () => wx.showToast({ title: '邀请链接已复制', icon: 'success' })
    });
  },

  onShareAppMessage() {
    const info = this.data.info || {};
    invitation.recordShare(this.data.code).catch(() => {});
    return {
      title: `【${info.familyName || '家族'}】${info.inviterNickname || '亲友'} 邀请您加入`,
      path: 'pages/invite-accept/invite-accept?code=' + this.data.code,
      imageUrl: this.data.posterPath || ''
    };
  },

  // ==================== 工具 ====================

  firstChar(str) {
    const s = String(str || '').trim();
    return s ? s.charAt(0) : '族';
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
});
