import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

type CelebrationTheme = "psychic" | "gameshow" | "fireworks";
type CelebrationType = "perfect" | "close" | null;

interface CelebrationOverlayProps {
  type: CelebrationType;
  theme: CelebrationTheme;
}

const THEME_CONFIG = {
  psychic: {
    bg: "bg-gradient-to-br from-purple-950 via-violet-900 to-indigo-950",
    perfect: {
      emoji: "🔮",
      headline: "YOU'RE PSYCHIC!",
      sub: "You read the room perfectly!",
    },
    close: {
      emoji: "🔮",
      headline: "SO CLOSE...",
      sub: "You nearly read their minds!",
    },
    textColor: "text-violet-200",
    accentColor: "text-violet-400",
  },
  gameshow: {
    bg: "bg-gradient-to-br from-yellow-950 via-amber-900 to-orange-950",
    perfect: {
      emoji: "🎉",
      headline: "DING DING DING!",
      sub: "Exact match — you nailed it!",
    },
    close: {
      emoji: "🎉",
      headline: "ALMOST!",
      sub: "So close to the jackpot!",
    },
    textColor: "text-yellow-100",
    accentColor: "text-amber-400",
  },
  fireworks: {
    bg: "bg-gradient-to-br from-blue-950 via-indigo-900 to-slate-950",
    perfect: {
      emoji: "🎆",
      headline: "PERFECT!",
      sub: "You predicted the crowd!",
    },
    close: {
      emoji: "🎆",
      headline: "NEARLY!",
      sub: "Just one off — great read!",
    },
    textColor: "text-blue-100",
    accentColor: "text-cyan-400",
  },
};

function PsychicStars({ intense }: { intense: boolean }) {
  const count = intense ? 22 : 12;
  const stars = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 2,
      duration: Math.random() * 2 + 2,
    }))
  ).current;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-violet-300"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            boxShadow: `0 0 ${star.size * 3}px ${star.size}px rgba(167,139,250,0.8)`,
          }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.4, 0.8] }}
          transition={{
            duration: star.duration,
            delay: star.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      {intense && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        >
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <div
              key={deg}
              className="absolute"
              style={{ transform: `rotate(${deg}deg) translateY(-120px)` }}
            >
              <div className="w-2 h-2 rounded-full bg-violet-400 opacity-70 shadow-[0_0_8px_4px_rgba(167,139,250,0.6)]" />
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function GameShowSpotlight() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute top-0 left-1/4 w-64 h-full opacity-10"
        style={{
          background: "conic-gradient(from 180deg at 50% 0%, transparent 70deg, rgba(253,224,71,0.8) 80deg, rgba(253,224,71,0.8) 100deg, transparent 110deg)",
        }}
        animate={{ rotate: [-8, 8, -8] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-0 right-1/4 w-64 h-full opacity-10"
        style={{
          background: "conic-gradient(from 180deg at 50% 0%, transparent 70deg, rgba(253,224,71,0.8) 80deg, rgba(253,224,71,0.8) 100deg, transparent 110deg)",
        }}
        animate={{ rotate: [8, -8, 8] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export default function CelebrationOverlay({ type, theme }: CelebrationOverlayProps) {
  const [visible, setVisible] = useState(true);
  const confettiFired = useRef(false);
  const prefersReducedMotion = typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  const config = THEME_CONFIG[theme];
  const content = type === "perfect" ? config.perfect : config.close;
  const intense = type === "perfect";

  useEffect(() => {
    if (!type || confettiFired.current) return;
    confettiFired.current = true;

    let fireworksInterval: ReturnType<typeof setInterval> | null = null;

    if (!prefersReducedMotion && theme === "fireworks") {
      const duration = intense ? 2200 : 1200;
      const end = Date.now() + duration;
      const colors = ["#60a5fa", "#818cf8", "#c4b5fd", "#38bdf8", "#facc15"];
      fireworksInterval = setInterval(() => {
        if (Date.now() > end) {
          clearInterval(fireworksInterval!);
          fireworksInterval = null;
          return;
        }
        confetti({
          particleCount: intense ? 6 : 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors,
          startVelocity: intense ? 45 : 30,
        });
        confetti({
          particleCount: intense ? 6 : 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors,
          startVelocity: intense ? 45 : 30,
        });
      }, 250);
    } else if (!prefersReducedMotion && theme === "gameshow") {
      confetti({
        particleCount: intense ? 180 : 80,
        spread: intense ? 100 : 70,
        origin: { y: 0.3 },
        colors: ["#fbbf24", "#f59e0b", "#d97706", "#fff", "#fde68a"],
        shapes: ["square"],
        scalar: intense ? 1.2 : 0.9,
        startVelocity: intense ? 50 : 30,
      });
    }

    const timer = setTimeout(() => setVisible(false), 3500);
    return () => {
      clearTimeout(timer);
      if (fireworksInterval !== null) clearInterval(fireworksInterval);
    };
  }, [type, theme, intense]);

  if (!type) return null;

  const motionDuration = prefersReducedMotion ? 0 : 0.35;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer ${config.bg}`}
          style={{ backdropFilter: "blur(2px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionDuration }}
          role="dialog"
          aria-modal="true"
          aria-label={content.headline}
          onClick={() => setVisible(false)}
        >
          {theme === "psychic" && <PsychicStars intense={intense} />}
          {theme === "gameshow" && <GameShowSpotlight />}

          {/* SR announcement so screen readers hear the overlay immediately */}
          <div role="status" aria-live="polite" className="sr-only">
            {content.headline}. {content.subtitle}
          </div>

          <div className="relative z-10 flex flex-col items-center gap-6 px-8 text-center select-none">
            <motion.div
              className="text-8xl"
              initial={{ scale: 0, rotate: -20 }}
              animate={prefersReducedMotion ? {} : { scale: [0, 1.3, 1], rotate: [0, 15, 0] }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: "easeOut" }}
            >
              {content.emoji}
            </motion.div>

            <motion.h1
              className={`font-black tracking-tight ${config.textColor} ${
                intense ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl"
              }`}
              style={{
                textShadow:
                  theme === "psychic"
                    ? "0 0 40px rgba(167,139,250,0.9)"
                    : theme === "gameshow"
                    ? "0 0 40px rgba(253,224,71,0.9)"
                    : "0 0 40px rgba(147,197,253,0.9)",
              }}
              initial={{ y: prefersReducedMotion ? 0 : 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.25, duration: prefersReducedMotion ? 0 : 0.5, ease: "easeOut" }}
            >
              {content.headline}
            </motion.h1>

            <motion.p
              className={`text-lg sm:text-xl font-medium ${config.accentColor}`}
              initial={{ y: prefersReducedMotion ? 0 : 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.45, duration: prefersReducedMotion ? 0 : 0.4 }}
            >
              {content.sub}
            </motion.p>

            {intense && !prefersReducedMotion && (
              <motion.div
                className={`flex gap-1 ${config.accentColor}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="text-2xl"
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity, repeatDelay: 1 }}
                  >
                    ✦
                  </motion.span>
                ))}
              </motion.div>
            )}
          </div>

          <motion.p
            className="absolute bottom-8 text-sm text-white/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            Tap to dismiss
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
