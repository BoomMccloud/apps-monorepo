import { Link } from '@tanstack/react-router'
import { LogoSVG } from '@/assets/logo'
import { SidebarTrigger } from './ui/sidebar'

export const MobileHeader = () => (
  <header
    className="sticky top-0 z-10 flex h-14 items-center justify-between border-border border-b bg-background px-4 md:hidden"
    data-app-header
  >
    <Link to="/">
      <LogoSVG width={35} height={40} className="text-foreground" />
    </Link>
    <SidebarTrigger />
  </header>
)
