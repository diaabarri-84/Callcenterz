export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl bg-accent font-display font-bold text-white shadow-[0_6px_20px_-6px_var(--color-accent)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      RX
    </span>
  )
}
