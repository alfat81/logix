import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        /* Статусные варианты BRANDBOOK §3.2: полное скругление
           («таблетка»), текст ЗАГЛАВНЫМИ, размер xs (базовый), без
           иконок. Цвета — токены --status-* в globals.css; применение
           в списках — этап C (P1-19). */
        transit:
          "border-transparent rounded-full uppercase bg-status-transit-bg text-status-transit-fg [a&]:hover:bg-status-transit-bg",
        delay:
          "border-transparent rounded-full uppercase bg-status-delay-bg text-status-delay-fg [a&]:hover:bg-status-delay-bg",
        delivered:
          "border-transparent rounded-full uppercase bg-status-delivered-bg text-status-delivered-fg [a&]:hover:bg-status-delivered-bg",
        version:
          "border-transparent rounded-full uppercase bg-status-version-bg text-status-version-fg [a&]:hover:bg-status-version-bg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
