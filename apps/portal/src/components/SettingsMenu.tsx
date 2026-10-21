import { useAnalyticsConsent } from '@ens-apps/utils/useAnalyticsConsent'
import { usePostHog } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import { MessageSquareTextIcon, ShieldCheckIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { ProfileSettingsIcon } from '@/assets/icons'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './ThemeToggle'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

// PostHog feedback survey opened from the menu instead of the floating tab,
// which competed with primary CTAs and covered the search input on mobile.
const FEEDBACK_SURVEY_ID = import.meta.env
  .VITE_PUBLIC_POSTHOG_FEEDBACK_SURVEY_ID

/** The feedback survey collects what the visitor types, so it waits for Accept. */
const FeedbackMenuItem = () => {
  const posthog = usePostHog()
  const { consent } = useAnalyticsConsent()

  if (!FEEDBACK_SURVEY_ID || consent !== 'granted') return null

  return (
    <DropdownMenuItem
      onSelect={() =>
        posthog.displaySurvey(FEEDBACK_SURVEY_ID, {
          displayType: 'popover',
          ignoreConditions: true,
          ignoreDelay: true,
        })
      }
    >
      <MessageSquareTextIcon className="size-4" />
      Feedback
    </DropdownMenuItem>
  )
}

export const SettingsMenu = ({
  side = 'right',
  className,
}: Pick<ComponentProps<typeof DropdownMenuContent>, 'side'> & {
  readonly className?: string
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'size-8 shrink-0 text-muted-foreground hover:text-foreground',
            className,
          )}
          aria-label="Settings"
        >
          <ProfileSettingsIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="min-w-52">
        <ThemeToggle />
        <FeedbackMenuItem />
        {/* Every page with this menu reaches the analytics choice. */}
        <DropdownMenuItem asChild>
          <Link to="/privacy">
            <ShieldCheckIcon className="size-4" />
            Privacy settings
          </Link>
        </DropdownMenuItem>
        {/* <DropdownMenuItem asChild>
          <ExternalLink href="https://sepolia.etherscan.io">
            <ChipLinkIcon className="size-3" />
            Sepolia explorer
          </ExternalLink>
        </DropdownMenuItem> */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
