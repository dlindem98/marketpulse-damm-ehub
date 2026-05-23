/**
 * PageContent + PageContentHeader — direct port of Dub consumer dashboard.
 *
 * Source: apps/web/ui/layout/page-content/index.tsx + page-content-header.tsx
 *
 * Structure inside the rounded-xl bg-white card:
 *   <PageContent title="…" controls={…}>
 *     <Header>  h-12 sm:h-16, border-b if there's title/controls
 *       PageWidthWrapper
 *         flex h-* items-center justify-between
 *           [back link] <h1 text-lg font-semibold> [info]    [controls]
 *     <Body>    pt-3 lg:pt-5
 *       {children}
 *
 * The body is also bg-white so it merges with the header.
 */

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { PageWidthWrapper } from "./PageWidthWrapper"
import { cn } from "@/lib/utils"

export type PageContentHeaderProps = {
  title?: React.ReactNode
  titleBackHref?: string
  controls?: React.ReactNode
  headerContent?: React.ReactNode
}

export function PageContent({
  title,
  titleBackHref,
  controls,
  headerContent,
  className,
  contentWrapperClassName,
  children,
}: PageContentHeaderProps & {
  className?: string
  contentWrapperClassName?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex min-h-full flex-col rounded-t-[inherit] bg-neutral-100 lg:bg-white", className)}>
      <PageContentHeader
        title={title}
        titleBackHref={titleBackHref}
        controls={controls}
        headerContent={headerContent}
      />
      <div className={cn("flex-1 rounded-t-[inherit] bg-white pt-3 lg:pt-5", contentWrapperClassName)}>
        {children}
      </div>
    </div>
  )
}

export function PageContentHeader({
  title, titleBackHref, controls, headerContent,
}: PageContentHeaderProps) {
  const hasHeaderContent = !!(title || controls || headerContent)

  return (
    <div className={cn(hasHeaderContent && "border-b border-neutral-200")}>
      <PageWidthWrapper>
        <div
          className={cn(
            "flex h-12 items-center justify-between gap-4",
            hasHeaderContent ? "sm:h-16" : "sm:h-0",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            {title && (
              <div className="flex min-w-0 items-center gap-2">
                {titleBackHref && (
                  <Link
                    href={titleBackHref}
                    className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Link>
                )}
                <h1 className="min-w-0 text-lg font-semibold leading-7 text-neutral-900">
                  {title}
                </h1>
              </div>
            )}
          </div>
          {controls && <div className="flex items-center gap-2">{controls}</div>}
        </div>
        {headerContent && <div className="pb-3 pt-1">{headerContent}</div>}
      </PageWidthWrapper>
    </div>
  )
}
