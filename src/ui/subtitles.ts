// Bark/dialog queue, bottom-center above the battle message line.
export class Subtitles {
  private readonly el: HTMLDivElement;
  private queue: { text: string; seconds: number }[] = [];
  private timer = 0;

  constructor(hudRoot: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;left:50%;transform:translateX(-50%);bottom:84px;font-size:17px;' +
      'color:#f0ead2;text-shadow:1px 1px 0 #000,0 0 8px #000;display:none;white-space:nowrap;' +
      'font-style:italic';
    hudRoot.appendChild(this.el);
  }

  say(text: string, seconds = 2.8): void {
    this.queue.push({ text, seconds });
  }

  update(realDt: number): void {
    if (this.timer > 0) {
      this.timer -= realDt;
      if (this.timer <= 0) this.el.style.display = 'none';
      return;
    }
    const next = this.queue.shift();
    if (next) {
      this.el.textContent = `“${next.text}”`;
      this.el.style.display = 'block';
      this.timer = next.seconds;
    }
  }
}
