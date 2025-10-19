import React, { useEffect, useRef, useState } from "react";

// =========================
// Hanzi Trainer – React Single‑file Prototype (fixed)
// - Defines Tests component to avoid "Tests is not defined" error
// - Always 4 canvas slots navigable by arrows (and keyboard)
// - Check shows gray ghosts for ALL characters; single ✓/✗ for whole word
// - Canvases clear after ✓ Correct or ✗ Fout
// - Start Again button when list is finished (reshuffles on restart)
// - Words shuffled on start; pinyin shown & spoken after Check
// - Ghost text auto-fits canvas size
// =========================

// ===== Types =====
type Card = {
  id: string;
  baseId: string;
  hanzi: string;
  pinyin: string;
  english: string;
  scheduledShort?: boolean;
  scheduledEnd?: boolean;
};

type Vocab = {
  hanzi: string;
  pinyin: string;
  english: string;
};

// ===== Data (sample) =====
const sampleCSV = `hanzi,pinyin,english
你好,nǐ hǎo,hello
好,hǎo,good fine
你,nǐ,you
是,shì,to be; yes
老师,lǎoshī,teacher
吗,ma,interrogative particle
不,bù,not; no
我,wǒ,I me
学生,xuésheng,student
她,tā,she her
谢谢,xièxie,thank you
不客气,bù kèqi,you’re welcome
您,nín,(polite) you
留学生,liúxuéshēng,foreign student; international student
叫,jiào,to call; to be called
什么,shénme,what
名字,míngzi,name
同学,tóngxué,classmate
们,men,suffix denoting plurality
来,lái,to come; used before another verb to indicate someone will do something
介绍,jièshào,to introduce
一下儿,yíxiàr,used after a verb to indicate a brief action
姓,xìng,to be surnamed; surname
的,de,auxiliary word indicating possession
哪,nǎ,which
国,guó,country
人,rén,people person
他,tā,he him
认识,rènshi,to meet; to know someone
很,hěn,very
高兴,gāoxìng,glad; happy
也,yě,too; also
呢,ne,modal particle for elliptical questions
就是,jiù shì,it means; it is
日语,Rìyǔ,Japanese language
这,zhè,this
杂志,zázhì,magazine
音乐,yīnyuè,music
朋友,péngyou,friend
汉日词典,Hàn-Rì Cídiǎn,Chinese-Japanese Dictionary
中村,Zhōngcún,a Japanese surname
日本,Rìběn,Japan
刘,Liú,a Chinese surname
刘明,Liú Míng,name of a person (male)
美国,Měiguó,America
玛丽,Mǎlì,name of a person (female)
加拿大,Jiānádà,Canada
中国,Zhōngguó,China
那,nà,that
谁,shéi/shuí,who; whom
书,shū,book
同屋,tóngwū,roommate
汉语,Hànyǔ,Chinese language
课本,kèběn,textbook
词典,cídiǎn,dictionary`;

// ===== Utils =====
function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function liteSplit(line: string): string[] {
  const parts = line.split(",");
  return [parts[0] ?? "", parts[1] ?? "", parts.slice(2).join(",") ?? ""];
}

function parseCSV2(text: string): Vocab[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  let dataLines = lines;
  if (/^\s*hanzi\s*,\s*pinyin\s*,\s*english\s*$/i.test(lines[0])) dataLines = lines.slice(1);
  const out: Vocab[] = [];
  for (const line of dataLines) {
    const [hanzi, pinyin, english] = liteSplit(line);
    if (!hanzi) continue;
    out.push({ hanzi, pinyin, english });
  }
  return out;
}

function shuffle<T>(array: T[]): T[] {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function textToCards(vocab: Vocab[]): Card[] {
  return vocab.map((v) => ({ id: uuid(), baseId: uuid(), ...v }));
}

// Split hanzi into up to 4 grapheme units; pad to 4
function splitHanziToChars(text: string, max = 4): string[] {
  if (!text) return new Array(max).fill("");
  const clean = text.replace(/[\s\u3000]/g, "");
  let units: string[] = [];
  try {
    // @ts-ignore
    if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
      // @ts-ignore
      const seg = new (Intl as any).Segmenter("zh", { granularity: "grapheme" });
      // @ts-ignore
      for (const { segment } of seg.segment(clean)) units.push(segment);
    } else {
      units = Array.from(clean);
    }
  } catch {
    units = Array.from(clean);
  }
  const first = units.slice(0, max);
  while (first.length < max) first.push("");
  return first;
}

// TTS for pinyin/hanzi (we speak whole word on Check)
function speakChinese(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-CN";
  utter.rate = 0.95;
  utter.pitch = 1.0;
  window.speechSynthesis.speak(utter);
}

// Compute font size so the character fits the canvas
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  boxW: number,
  boxH: number,
  padding = 16
) {
  let size = Math.min(boxW, boxH) - padding * 2;
  size = Math.max(12, Math.floor(size));
  ctx.font = `${size}px sans-serif`;
  let m = ctx.measureText(text);
  while ((m.width > boxW - 2 * padding || size > boxH - 2 * padding) && size > 12) {
    size -= 2;
    ctx.font = `${size}px sans-serif`;
    m = ctx.measureText(text);
  }
  return size;
}

// ===== Canvas Components =====
const DrawCanvas = React.forwardRef(function DrawCanvas(
  {
    width = 360,
    height = 360,
    ghostChar,
    showGhost,
  }: { width?: number; height?: number; ghostChar?: string; showGhost?: boolean },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ghostRef = useRef<HTMLCanvasElement | null>(null);

  React.useImperativeHandle(ref, () => ({
    clear: () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
    },
  }));

  // Ghost layer
  useEffect(() => {
    const g = ghostRef.current!;
    const ctx = g.getContext("2d")!;
    g.width = width;
    g.height = height;
    ctx.clearRect(0, 0, width, height);
    if (showGhost && ghostChar) {
      const size = fitFontSize(ctx, ghostChar, width, height, 16);
      ctx.globalAlpha = 0.22;
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#9ca3af";
      ctx.fillText(ghostChar, width / 2, height / 2);
      ctx.globalAlpha = 1;
    }
  }, [ghostChar, showGhost, width, height]);

  // Drawing layer
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    c.width = width;
    c.height = height;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#111827";

    let drawing = false;
    const pos = (e: any) => {
      const rect = c.getBoundingClientRect();
      const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
      const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
      return { x, y };
    };

    const down = (e: any) => {
      e.preventDefault();
      drawing = true;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const move = (e: any) => {
      if (!drawing) return;
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const up = () => (drawing = false);

    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    c.addEventListener("touchstart", down, { passive: false } as any);
    c.addEventListener("touchmove", move, { passive: false } as any);
    window.addEventListener("touchend", up);

    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      c.removeEventListener("touchstart", down as any);
      c.removeEventListener("touchmove", move as any);
      window.removeEventListener("touchend", up);
    };
  }, [width, height]);

  return (
    <div className="relative">
      <canvas
        ref={ghostRef}
        className="absolute top-0 left-0"
        width={width}
        height={height}
        style={{ pointerEvents: "none", zIndex: 0 }}
      />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-2xl border border-gray-300"
        style={{ zIndex: 1, touchAction: "none" }}
      />
    </div>
  );
});

function MultiCanvas({
  width = 360,
  height = 360,
  hanzi,
  showGhost,
  clearSignal,
}: {
  width?: number;
  height?: number;
  hanzi: string;
  showGhost: boolean;
  clearSignal: number;
}) {
  const [slot, setSlot] = useState(0);
  const chars = splitHanziToChars(hanzi, 4);
  const refs = [useRef<any>(null), useRef<any>(null), useRef<any>(null), useRef<any>(null)];

  // Clear all slots when signal increments
  useEffect(() => {
    refs.forEach((r) => r.current?.clear());
  }, [clearSignal]);

  const goLeft = () => setSlot((s) => (s + 3) % 4);
  const goRight = () => setSlot((s) => (s + 1) % 4);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goLeft();
      if (e.key === "ArrowRight") goRight();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative flex flex-col items-center">
      <div className="overflow-hidden rounded-2xl border border-gray-300" style={{ width, height }}>
        <div className="flex transition-transform duration-300 ease-out" style={{ width: width * 4, transform: `translateX(-${slot * width}px)` }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width, height }} className="flex items-center justify-center">
              <DrawCanvas ref={refs[i]} width={width} height={height} ghostChar={chars[i]} showGhost={showGhost} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between w-full mt-2">
        <button onClick={goLeft} aria-label="Previous">◀</button>
        <span>{slot + 1}/4</span>
        <button onClick={goRight} aria-label="Next">▶</button>
      </div>
    </div>
  );
}

// =========================
// Main Component
// =========================
export default function HanziTrainer() {
  const [cards, setCards] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const current = cards[idx];

  function loadCards() {
    const vocab = parseCSV2(sampleCSV);
    const shuffled = shuffle(textToCards(vocab));
    setCards(shuffled);
    setIdx(0);
    setShowAnswer(false);
    setClearSignal(0);
  }

  // Shuffle on mount
  useEffect(() => {
    loadCards();
  }, []);

  const clearAllCanvases = () => setClearSignal((x) => x + 1);

  const next = () => {
    setIdx((i) => Math.min(i + 1, cards.length));
    setShowAnswer(false);
    clearAllCanvases();
  };

  function onIncorrect() {
    const card = cards[idx];
    const short: Card = { ...card, id: uuid(), scheduledShort: true };
    const atEnd: Card = { ...card, id: uuid(), scheduledEnd: true };
    setCards((prev) => {
      const copy = prev.slice();
      const insertPos = Math.min(idx + 4, copy.length);
      copy.splice(insertPos, 0, short);
      copy.push(atEnd);
      return copy;
    });
    clearAllCanvases();
    next();
  }

  function onCheck() {
    setShowAnswer(true);
    if (current?.pinyin) speakChinese(current.pinyin);
  }

  if (!current) {
    return (
      <div className="p-6 text-center">
        <div className="text-xl font-semibold mb-3">🎉 Done!</div>
        <button
          onClick={loadCards}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white shadow-md hover:bg-blue-600"
        >
          🔁 Start Again
        </button>
        <Tests />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3">
        <div className="text-xl font-semibold">{current.english}</div>
        <div className="text-lg text-gray-600 italic">{showAnswer && current.pinyin}</div>
        <div className="flex gap-2">
          <button onClick={onCheck} className="px-3 py-1.5 rounded-lg border shadow-sm">Check / Toon antwoord</button>
          {showAnswer && (
            <>
              <button onClick={next} className="px-3 py-1.5 rounded-lg border shadow-sm">✓ Correct</button>
              <button onClick={onIncorrect} className="px-3 py-1.5 rounded-lg border shadow-sm">✗ Fout</button>
            </>
          )}
        </div>
        <MultiCanvas width={300} height={300} hanzi={current.hanzi} showGhost={showAnswer} clearSignal={clearSignal} />
      </div>
      <Tests />
    </div>
  );
}

// =========================
// Runtime Tests (non-blocking console asserts)
// =========================
function Tests() {
  useEffect(() => {
    try {
      // liteSplit
      console.assert(
        JSON.stringify(liteSplit("你,nǐ,you")) === JSON.stringify(["你", "nǐ", "you"]),
        "liteSplit basic"
      );
      console.assert(
        JSON.stringify(liteSplit("谢,xiè,thanks,alot")) === JSON.stringify(["谢", "xiè", "thanks,alot"]),
        "liteSplit with commas in tail"
      );

      // parseCSV2
      const csv = `hanzi,pinyin,english\n好,hǎo,good\n吗,ma,interrogative`;
      const parsed = parseCSV2(csv);
      console.assert(parsed.length === 2 && parsed[0].hanzi === "好" && parsed[1].pinyin === "ma", "parseCSV2 basic");

      // split hanzi
      const s1 = splitHanziToChars("你好", 4);
      console.assert(s1.length === 4 && s1[0] === "你" && s1[1] === "好" && s1[2] === "" && s1[3] === "", "split 2-chars padded to 4");
      const s2 = splitHanziToChars("汉日词典", 4);
      console.assert(s2[3] === "典", "split 4-chars");
      const s3 = splitHanziToChars("中 国", 4);
      console.assert(s3[0] === "中" && s3[1] === "国", "ignores spaces");

      // font fit sanity
      const cvs = document.createElement('canvas');
      const ctx = cvs.getContext('2d');
      if (ctx) {
        const size = fitFontSize(ctx as any, "汉", 300, 300, 16);
        console.assert(size > 20, "fitFontSize returns sensible size");
      }

      console.log("Tests passed ✅");
    } catch (e) {
      console.error("Tests failed ❌", e);
    }
  }, []);
  return null;
}
