import React from 'react'
import { NavCard, ACCENT_CLASSES } from '../../config/nav-data'

const NavCardButton: React.FC<{ card: NavCard; onClick: () => void }> = ({ card, onClick }) => {
  const ac = ACCENT_CLASSES[card.accent] ?? ACCENT_CLASSES.slate
  const Icon = card.icon
  return (
    <button
      onClick={onClick}
      className={`
        h-full w-full flex flex-col items-center justify-center gap-2
        bg-slate-50 border border-slate-100 rounded-xl
        transition-all duration-150 active:scale-[0.97]
        ${ac.hover}
      `}
    >
      <Icon className={`w-8 h-8 ${ac.icon}`} />
      <div className="text-center px-1">
        <div className="text-[13px] font-semibold text-slate-800 leading-tight">{card.label}</div>
        <div className="text-[10px] text-slate-400 leading-none mt-0.5">{card.sub}</div>
      </div>
    </button>
  )
}

export default NavCardButton
