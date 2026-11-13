interface IconProps {
  children: React.ReactNode;
}

function Icon({ children }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-[18px] fill-none stroke-current" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** One icon per worktree action; every surface offering the same action renders the same icon. */
export const ACTION_ICONS = {
  graph: (
    <Icon>
      <circle cx="5" cy="4.5" r="1.8" />
      <circle cx="5" cy="15.5" r="1.8" />
      <circle cx="14.5" cy="8" r="1.8" />
      <path d="M5 6.3v7.4M14.5 9.8c0 3-3 3.2-9.5 4" />
    </Icon>
  ),
  diff: (
    <Icon>
      <rect x="3.5" y="2.5" width="13" height="15" rx="2" />
      <path d="M7 7h6M10 4.8v4.4M7 13.5h6" />
    </Icon>
  ),
  worktree: (
    <Icon>
      <path d="M2.5 6.5a2 2 0 0 1 2-2h3l1.6 1.8h6.4a2 2 0 0 1 2 2v6.7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
      <path d="M10 9.5v4M8 11.5h4" />
    </Icon>
  ),
  session: (
    <Icon>
      <path d="M3.5 5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H9l-3.5 3v-3a2 2 0 0 1-2-2z" />
      <path d="M10 5.8v5M7.5 8.3h5" />
    </Icon>
  ),
  terminal: (
    <Icon>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="m6 8 2.5 2L6 12M10.5 12.5h3.5" />
    </Icon>
  ),
  rename: (
    <Icon>
      <path d="M12.8 3.7a1.8 1.8 0 0 1 2.5 2.5L7 14.5l-3.3.8.8-3.3z" />
      <path d="M11.5 5l2.5 2.5" />
    </Icon>
  ),
  focus: (
    <Icon>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="2.2" />
      <path d="M10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5" />
    </Icon>
  ),
  remove: (
    <Icon>
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M5 5.5l.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5M8.5 8.5v5M11.5 8.5v5" />
    </Icon>
  ),
};
