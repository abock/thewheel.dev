// Copyright 2023 Aaron Bockover.
// Licensed under the MIT License.

const TAU = Math.PI * 2;

type TheWheelSelectedSliceChanged = (
  theWheel: TheWheel,
  isFinal: boolean,
  slice?: Slice,
) => void;

interface Slice {
  text: string;
  color?: string;
  selectedCount?: number;
}

class TheWheelTheme {
  readonly inset: number = 20;

  applyDefaultStroke(g: CanvasRenderingContext2D) {
    g.strokeStyle = "white";
    g.lineWidth = 2;
  }

  applyDefaultShadow(g: CanvasRenderingContext2D) {
    g.shadowColor = "rgba(0, 0, 0, 0.5)";
    g.shadowBlur = 20;
    g.shadowOffsetY = 10;
  }

  applyWheel(g: CanvasRenderingContext2D) {
    g.fillStyle = "rgb(240, 129, 82)";
    this.applyDefaultShadow(g);
  }

  applySlice(g: CanvasRenderingContext2D, slice: Slice) {
    this.applyDefaultStroke(g);
  }

  applySliceText(g: CanvasRenderingContext2D, fontSize: number) {
    g.font = `bold ${fontSize}px sans-serif`;
    g.fillStyle = "rgba(0, 0, 0, 0.75)";
  }

  applySpinButton(g: CanvasRenderingContext2D) {
    g.fillStyle = "rgba(20, 23, 32, 0.95)";
    this.applyDefaultShadow(g);
    this.applyDefaultStroke(g);
  }

  applySpinButtonText(g: CanvasRenderingContext2D, fontSize: number) {
    g.font = `bold ${fontSize}px sans-serif`;
    g.fillStyle = "white";
  }
}

class TheWheel {
  private onSelectedSliceChanged?: TheWheelSelectedSliceChanged;
  private theme: TheWheelTheme;
  private _slices: Slice[] = [];
  private _slicesInPlay: Slice[] = [];
  private _selectedSliceIndex: number = 0;
  private pallete: string[] = []

  private readonly containerElem: HTMLElement;
  private readonly canvasElem: HTMLCanvasElement;

  private readonly renderContext: CanvasRenderingContext2D;
  private renderScale: number = 1;
  private renderWidth: number = 0;
  private renderHeight: number = 0;
  private renderRadius: number = 0;
  private spinButtonSize: number = 0;
  private spinButtonPath?: Path2D;

  private readonly potentialMinVelocity: number = 0.3;
  private readonly potentialMaxVelocity: number = 0.6;
  private readonly stopVelocity: number = 0.002;
  private readonly friction: number = 0.99;
  private readonly acceleration: number = 1.25;

  private isSpinning: boolean = false;
  private isAccelerating: boolean = false;
  private maxVelocity: number = 0;
  private currentVelocity: number = 0;
  private _currentRotation: number = 0;
  private initialRotation: number = TheWheel.random(0, TAU);

  constructor(
    containerElem: HTMLElement,
    onSelectedSliceChanged?: TheWheelSelectedSliceChanged,
    theme?: TheWheelTheme) {
    this.onSelectedSliceChanged = onSelectedSliceChanged;
    this.theme = theme || new TheWheelTheme();

    this.containerElem = containerElem;

    this.canvasElem = document.createElement("canvas");
    this.canvasElem.style.width = "100%";
    this.canvasElem.style.height = "100%";

    this.onResize = this.onResize.bind(this);
    window.addEventListener("resize", this.onResize);

    this.onMouseMove = this.onMouseMove.bind(this);
    this.canvasElem.addEventListener("mousemove", this.onMouseMove);

    this.onMouseClick = this.onMouseClick.bind(this);
    this.canvasElem.addEventListener("click", this.onMouseClick);

    this.spinLoop = this.spinLoop.bind(this);

    const g = this.canvasElem.getContext("2d");
    if (!g) {
      throw new Error(
        `unable to acquire CanvasRenderingContext2D ` +
        `from <canvas> ${this.canvasElem}`); 
    }

    this.renderContext = g;
    this.selectedSliceIndex = 0;
    this._currentRotation = this.initialRotation;
    this.mount();
  }

  private static random(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private get currentRotation(): number {
    return this._currentRotation;
  }

  private set currentRotation(angle: number) {
    this._currentRotation = angle;

    const n = this.slicesInPlay.length;
    const i = Math.floor(n - this.currentRotation / TAU * n) % n;
    if (this.selectedSliceIndex != i) {
      this.selectedSliceIndex = i;
      if (this.selectedSlice) {
        if (!this.selectedSlice.selectedCount) {
          this.selectedSlice.selectedCount = 1;
        } else {
          this.selectedSlice.selectedCount++;
        }
      }
    }
  }

  get slicesInPlay(): Slice[] {
    return this._slicesInPlay;
  }

  get slices(): Slice[] {
    return this._slices;
  }

  set slices(slices: (Slice | string)[]) {
    this._slices = [];
    for (const slice of slices) {
      if (slice instanceof Object) {
        this._slices.push(slice);
      } else {
        this._slices.push({
          text: slice
        });
      }
    }

    this._slicesInPlay = [...this._slices];

    this.selectedSliceIndex = 0;
    this.stop();
    this.render();
  }

  removeSelectedSliceFromPlay() {
    this.slicesInPlay.splice(this.selectedSliceIndex, 1);
    if (this.slicesInPlay.length === 0) {
      this._slicesInPlay = [...this._slices];
    }
    this.currentRotation = this._currentRotation;
    this.render();
  }

  setSlicesFromText(text: string) {
    const slices: Slice[] = [];
    for (let sliceText of text.split("\n")) {
      sliceText = sliceText.trim();
      if (sliceText.length > 0) {
        slices.push({
          text: sliceText
        });
      }
    }
    this.slices = slices;
  }

  get selectedSliceIndex(): number {
    return this._selectedSliceIndex;
  }

  get selectedSlice(): Slice | undefined {
    return this.slicesInPlay.length > 0
      ? this.slicesInPlay[this.selectedSliceIndex]
      : undefined;
  }

  private set selectedSliceIndex(index: number) {
    this._selectedSliceIndex = index;
    if (this.onSelectedSliceChanged) {
      this.onSelectedSliceChanged(this, !this.isSpinning, this.selectedSlice);
    }
  }

  private get isMounted(): boolean {
    return this.canvasElem.parentElement === this.containerElem;
  }

  mount() {
    if (!this.isMounted) {
      this.containerElem.appendChild(this.canvasElem);
      this.configureRenderContext();
      this.render();
    }
  }

  unmount() {
    if (this.isMounted) {
      this.canvasElem.remove();
    }
  }

  spin(stopIfSpinning: boolean = false) {
    if (this.isSpinning && stopIfSpinning) {
      this.stop();
    }

    this.isAccelerating = true;
    this.maxVelocity = TheWheel.random(
      this.potentialMinVelocity,
      this.potentialMaxVelocity);

    if (!this.isSpinning) {
      this.isSpinning = true;
      this.spinLoop();
    }
  }

  stop() {
    this.isSpinning = false;
    this.isAccelerating = false;
    this.currentVelocity = 0;
    this.currentRotation = this.initialRotation;
    this.render();
  }

  private onResize() {
    requestAnimationFrame(() => {    
      this.configureRenderContext();
      this.render()
    });
  }

  private configureRenderContext() {
    this.renderScale = window.devicePixelRatio || 1;

    const domRect = this.canvasElem.getBoundingClientRect();
    this.renderWidth = domRect.width;
    this.renderHeight = domRect.width;
    this.renderRadius = (this.renderWidth - (this.theme.inset * 2)) / 2;
    this.spinButtonSize = this.renderRadius * 0.15;

    this.canvasElem.width = Math.ceil(this.renderWidth * this.renderScale);
    this.canvasElem.height = Math.ceil(this.renderWidth * this.renderScale);

    this.renderContext.resetTransform();
    this.renderContext.setTransform(
      this.renderScale, 0, 0,
      this.renderScale, 0, 0);

    this.spinButtonPath = undefined;
  }

  private renderComponent(f: (() => void)) {
    this.renderContext.save();
    f.apply(this);
    this.renderContext.restore();
  }

  private render() {
    this.renderContext.clearRect(0, 0, this.renderWidth, this.renderHeight);
    this.renderComponent(() => {
      this.renderContext.translate(this.theme.inset, this.theme.inset);
      this.renderComponent(this.renderWheel);
      for (let i = 0; i < this.slicesInPlay.length; i++) {
        this.renderComponent(() => this.renderSlice(i));
      }
      this.renderComponent(this.renderSpinButton);
    });
  }

  private renderWheel() {
    const g = this.renderContext;
    const radius = this.renderRadius;

    g.beginPath();
    g.arc(radius, radius, radius, -Math.PI, Math.PI);
    g.closePath();

    this.theme.applyWheel(g);
    g.fill();
    g.stroke();
  }

  private renderSlice(sliceIndex: number) {
    const g = this.renderContext;
    const radius = this.renderRadius;
    const slice = this.slicesInPlay[sliceIndex];
    const arc = TAU / this.slicesInPlay.length;
    const angle = (arc * sliceIndex + this.currentRotation) % TAU;
    
    const path = new Path2D();
    path.moveTo(radius, radius);
    path.arc(radius, radius, radius, angle, angle + arc);
    path.lineTo(radius, radius);
    path.closePath();

    this.theme.applySlice(g, slice);
    g.fillStyle = slice.color || 
      `hsl(${(360 / this._slices.length) * sliceIndex}deg, 80%, 60%)`;
    g.fill(path);

    if (this.slicesInPlay.length > 1) {
      g.stroke(path);
    }

    g.translate(radius, radius);
    g.rotate(angle + arc / 2);

    this.theme.applySliceText(g, radius / 10);

    const textMetrics = g.measureText(slice.text);
    const textBoxHeight = textMetrics.actualBoundingBoxAscent +
      textMetrics.actualBoundingBoxDescent;
    const minX = textBoxHeight * 2;

    g.fillText(
      slice.text,
      Math.max(minX, textBoxHeight + (radius - textMetrics.width) * 0.5),
      textMetrics.actualBoundingBoxAscent / 2,
      radius - minX - 20);
  }

  private renderSpinButton() {
    const g = this.renderContext;
    const radius = this.renderRadius;
    const size = this.spinButtonSize;

    if (!this.spinButtonPath) {
      this.spinButtonPath = new Path2D();
      this.spinButtonPath.arc(
        radius,
        radius,
        size,
        Math.PI / 2,
        -Math.PI / 2);
      this.spinButtonPath.quadraticCurveTo(
        radius + size / 2,
        radius - size,
        radius + size * 2,
        radius);
      this.spinButtonPath.quadraticCurveTo(
        radius + size / 2,
        radius + size,
        radius,
        radius + size);
      this.spinButtonPath.closePath();
    }

    this.theme.applySpinButton(g);

    g.fill(this.spinButtonPath);
    g.stroke(this.spinButtonPath);

    this.theme.applySpinButtonText(g, size / 2);

    const label = "SPIN!";
    const textMetrics = g.measureText(label);
    const gravity = 1.1;

    g.fillText(
      label,
      radius - size * gravity + textMetrics.width / 2,
      radius + (
        textMetrics.actualBoundingBoxAscent +
        textMetrics.actualBoundingBoxDescent) / 2);
  }

  private isMouseInPath(event: MouseEvent, path?: Path2D): boolean {
    if (!path) {
      return false;
    }

    const rect = this.canvasElem.getBoundingClientRect();
    const left = rect.left + this.theme.inset;
    const top = rect.top + this.theme.inset;
    const x = (event.clientX - left) * this.renderScale;
    const y = (event.clientY - top) * this.renderScale;

    return this.renderContext.isPointInPath(path, x, y);
  }

  private onMouseMove(event: MouseEvent): any {
    this.canvasElem.style.cursor = this.isMouseInPath(
      event,
      this.spinButtonPath)
        ? "pointer"
        : "initial";
  }

  private onMouseClick(event: MouseEvent): any {
    if (this.isMouseInPath(event, this.spinButtonPath)) {
      this.spin();
    }
  }

  private spinLoop() {
    if (!this.isSpinning) {
      return;
    }

    this.spinLoopFrame();
    requestAnimationFrame(this.spinLoop);
  }

  private spinLoopFrame() {
    if (this.slicesInPlay.length <= 0) {
      return;
    }

    if (this.currentVelocity >= this.maxVelocity) {
      this.isAccelerating = false;
    }

    if (this.isAccelerating) {
      this.currentVelocity = Math.max(this.currentVelocity, this.stopVelocity);
      this.currentVelocity *= this.acceleration;
    } else {
      this.currentVelocity *= this.friction;
      if (this.currentVelocity < this.stopVelocity) {
        this.isSpinning = false;
        this.currentVelocity = 0;
      }
    }

    this.currentRotation = (this.currentRotation + this.currentVelocity) % TAU;

    this.render();
  }
}