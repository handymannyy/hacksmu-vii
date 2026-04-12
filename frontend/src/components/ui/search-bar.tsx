import type React from "react"
import { useState, useRef, useCallback } from "react"
import { Search, MapPin } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface Suggestion {
  id: string
  place_name: string
  center: [number, number]
}

interface SearchBarProps {
  accessToken: string
  placeholder?: string
  onRetrieve?: (lng: number, lat: number, label: string) => void
}

const GooeyFilter = () => (
  <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
    <defs>
      <filter id="gooey-effect">
        <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
        <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8" result="goo" />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>
    </defs>
  </svg>
)

const SearchBar = ({ accessToken, placeholder = "Search location...", onRetrieve }: SearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isAnimating, setIsAnimating] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isClicked, setIsClicked] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (!query.trim()) { setSuggestions([]); return }
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${accessToken}&autocomplete=true&limit=5`
        )
        const data = await res.json()
        setSuggestions(data.features || [])
      } catch {
        setSuggestions([])
      }
    },
    [accessToken]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 280)
  }

  const handleSelect = (suggestion: Suggestion) => {
    setSearchQuery(suggestion.place_name)
    setSuggestions([])
    setIsFocused(false)
    setIsAnimating(true)
    setTimeout(() => setIsAnimating(false), 1000)
    onRetrieve?.(suggestion.center[0], suggestion.center[1], suggestion.place_name)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (suggestions[0]) handleSelect(suggestions[0])
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isFocused) return
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setIsClicked(true)
    setTimeout(() => setIsClicked(false), 800)
  }

  // Floating particles using app's cyan/sky palette
  const particles = isFocused
    ? Array.from({ length: 14 }, (_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0 }}
          animate={{
            x: [0, (Math.random() - 0.5) * 35],
            y: [0, (Math.random() - 0.5) * 35],
            scale: [0, Math.random() * 0.7 + 0.3],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: Math.random() * 1.5 + 1.5,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "reverse",
          }}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            filter: "blur(2px)",
            background: i % 2 === 0
              ? "rgba(56, 189, 248, 0.7)"   // sky-400
              : "rgba(6, 182, 212, 0.7)",   // cyan-500
          }}
        />
      ))
    : null

  const clickParticles = isClicked
    ? Array.from({ length: 12 }, (_, i) => (
        <motion.div
          key={`click-${i}`}
          initial={{ x: mousePosition.x, y: mousePosition.y, scale: 0, opacity: 1 }}
          animate={{
            x: mousePosition.x + (Math.random() - 0.5) * 130,
            y: mousePosition.y + (Math.random() - 0.5) * 130,
            scale: Math.random() * 0.7 + 0.2,
            opacity: [1, 0],
          }}
          transition={{ duration: Math.random() * 0.7 + 0.4, ease: "easeOut" }}
          className="absolute w-2 h-2 rounded-full pointer-events-none"
          style={{
            background: i % 3 === 0
              ? "rgba(56, 189, 248, 0.9)"
              : i % 3 === 1
              ? "rgba(6, 182, 212, 0.9)"
              : "rgba(14, 165, 233, 0.9)",
            boxShadow: "0 0 6px rgba(56, 189, 248, 0.8)",
          }}
        />
      ))
    : null

  const searchIconVariants = {
    initial: { scale: 1 },
    animate: {
      rotate: isAnimating ? [0, -15, 15, -10, 10, 0] : 0,
      scale: isAnimating ? [1, 1.3, 1] : 1,
      transition: { duration: 0.6, ease: "easeInOut" as const },
    },
  }

  return (
    <div className="relative w-full">
      <GooeyFilter />

      <motion.form
        onSubmit={handleSubmit}
        className="relative flex items-center justify-center w-full"
        animate={{ scale: isFocused ? 1.03 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onMouseMove={handleMouseMove}
      >
        <motion.div
          className="flex items-center w-full rounded-xl relative overflow-hidden"
          style={{
            background: "rgba(2, 8, 23, 0.75)",
            backdropFilter: "blur(14px)",
            border: `1px solid ${isFocused ? "rgba(6, 182, 212, 0.55)" : "rgba(51, 65, 85, 0.6)"}`,
          }}
          animate={{
            boxShadow: isClicked
              ? "0 0 30px rgba(6, 182, 212, 0.35), 0 0 10px rgba(56, 189, 248, 0.25) inset"
              : isFocused
              ? "0 0 18px rgba(6, 182, 212, 0.18)"
              : "none",
          }}
          onClick={handleClick}
        >
          {/* Animated gradient background when focused */}
          {isFocused && (
            <motion.div
              className="absolute inset-0 -z-10"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 0.07,
                background: [
                  "linear-gradient(90deg, #0ea5e9 0%, #22d3ee 100%)",
                  "linear-gradient(90deg, #22d3ee 0%, #38bdf8 100%)",
                  "linear-gradient(90deg, #0284c7 0%, #0ea5e9 100%)",
                  "linear-gradient(90deg, #0ea5e9 0%, #22d3ee 100%)",
                ],
              }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            />
          )}

          {/* Gooey particles */}
          <div
            className="absolute inset-0 overflow-hidden rounded-xl"
            style={{ filter: "url(#gooey-effect)", zIndex: 0 }}
          >
            {particles}
          </div>

          {/* Click ripple */}
          {isClicked && (
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              initial={{ scale: 0, opacity: 0.4 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              style={{ background: "rgba(6, 182, 212, 0.15)", zIndex: 0 }}
            />
          )}

          {clickParticles}

          {/* Search icon */}
          <motion.div
            className="pl-3 py-2 relative z-10"
            variants={searchIconVariants}
            initial="initial"
            animate="animate"
          >
            <Search
              size={14}
              strokeWidth={isFocused ? 2.5 : 2}
              style={{
                color: isAnimating ? "#22d3ee" : isFocused ? "#38bdf8" : "#64748b",
                transition: "color 0.3s",
              }}
            />
          </motion.div>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={searchQuery}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            className="w-full py-2 px-2 bg-transparent outline-none text-xs relative z-10"
            style={{
              color: isFocused ? "#e2e8f0" : "#94a3b8",
              letterSpacing: isFocused ? "0.02em" : "normal",
            }}
          />

          {/* Go button */}
          <AnimatePresence>
            {searchQuery && (
              <motion.button
                type="submit"
                initial={{ opacity: 0, scale: 0.8, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -10 }}
                whileHover={{
                  scale: 1.06,
                  boxShadow: "0 6px 18px -4px rgba(6, 182, 212, 0.5)",
                }}
                whileTap={{ scale: 0.94 }}
                className="px-3 py-1 mr-2 text-xs font-semibold rounded-lg text-white relative z-10 shrink-0"
                style={{ background: "linear-gradient(135deg, #0ea5e9, #22d3ee)" }}
              >
                Go
              </motion.button>
            )}
          </AnimatePresence>

          {/* Shimmer on focus */}
          {isFocused && (
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0, 0.08, 0.15, 0.08, 0],
                background: "radial-gradient(circle at 50% 0%, rgba(56,189,248,0.6) 0%, transparent 70%)",
              }}
              transition={{ duration: 2.5, repeat: Infinity, repeatType: "loop" }}
            />
          )}
        </motion.div>
      </motion.form>

      {/* Suggestion dropdown */}
      <AnimatePresence>
        {isFocused && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 6, height: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute z-50 w-full mt-1.5 rounded-xl overflow-hidden shadow-xl"
            style={{
              background: "rgba(2, 8, 23, 0.92)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(51, 65, 85, 0.6)",
            }}
          >
            <div className="p-1.5">
              {suggestions.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => handleSelect(s)}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer rounded-lg group transition-colors"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(6, 182, 212, 0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <MapPin size={11} className="text-slate-600 group-hover:text-cyan-400 shrink-0 transition-colors" />
                  <span className="text-xs text-slate-400 group-hover:text-cyan-300 truncate transition-colors">
                    {s.place_name}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export { SearchBar }
