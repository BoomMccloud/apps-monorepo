import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'react-external-link'

const MENU_ITEM_CLASS =
  'flex flex-row items-center gap-2 px-2 py-1.5 text-base rounded-sm hover:bg-muted transition-colors'

export const HelpMenu = () => {
  return (
    <div className="flex flex-col gap-1">
      <ExternalLink
        className={MENU_ITEM_CLASS}
        href="https://app.ens.domains/legal/terms-of-use"
      >
        Terms of Use
      </ExternalLink>
      {/* The Explorer's own notice, with the analytics choice; it links
          onward to the full policy. */}
      <Link className={MENU_ITEM_CLASS} to="/privacy">
        Privacy Policy
      </Link>
      <ExternalLink
        className={MENU_ITEM_CLASS}
        href="https://ens.domains/legal/trademark-guidelines"
      >
        Trademark Guidelines
      </ExternalLink>
      <ExternalLink
        className={MENU_ITEM_CLASS}
        href="https://support.ens.domains/"
      >
        Support
      </ExternalLink>
    </div>
  )
}
