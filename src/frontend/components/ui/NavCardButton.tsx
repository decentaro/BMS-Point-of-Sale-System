import React from 'react'
import { NavCard, ACCENT_CLASSES } from '../../config/nav-data'

const NavCardButton: React.FC<{ card: NavCard; onClick: () => void }> = ({ card, onClick }) => {
  const ac = ACCENT_CLASSES[card.accent] ?? ACCENT_CLASSES.slate
  const Icon = card.icon
  return (
    <button
      onClick={onClick}
      className={`
        h-[72px] w-full flex flex-col items-center justify-center gap-1
        bg-white border border-slate-200 rounded-xl shadow-sm
        transition-all duration-150 active:scale-[0.97]
        ${ac.hover}
      `}
    >
      <Icon className={`w-5 h-5 ${ac.icon}`} />
      <span className="text-[13px] font-semibold text-slate-800 leading-tight">{card.label}</span>
      <span className="text-[10px] text-slate-400 leading-none">{card.sub}</span>
    </button>
  )
}

export default NavCardButton
