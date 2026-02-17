import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: cn(defaultClassNames.root, ""),
        months: cn(defaultClassNames.months, "flex flex-col sm:flex-row gap-2"),
        month: cn(defaultClassNames.month, "flex flex-col gap-4"),
        month_caption: cn(defaultClassNames.month_caption, "flex justify-center pt-1 relative items-center h-7"),
        caption_label: cn(defaultClassNames.caption_label, "text-sm font-medium"),
        nav: cn(defaultClassNames.nav, "flex items-center gap-1"),
        button_previous: cn(
          defaultClassNames.button_previous,
          buttonVariants({ variant: "outline" }),
          "absolute left-1 top-0 size-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        button_next: cn(
          defaultClassNames.button_next,
          buttonVariants({ variant: "outline" }),
          "absolute right-1 top-0 size-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        month_grid: cn(defaultClassNames.month_grid, "w-full border-collapse"),
        weekdays: cn(defaultClassNames.weekdays, "flex"),
        weekday: cn(
          defaultClassNames.weekday,
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]"
        ),
        week: cn(defaultClassNames.week, "flex w-full mt-2"),
        day: cn(
          defaultClassNames.day,
          "relative p-0 text-center text-sm rounded-md focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].rdp-outside)]:bg-accent/50"
        ),
        day_button: cn(
          defaultClassNames.day_button,
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 font-normal rounded-md aria-selected:opacity-100"
        ),
        range_start: cn(defaultClassNames.range_start, "rdp-range_start"),
        range_end: cn(defaultClassNames.range_end, "rdp-range_end"),
        selected: cn(
          defaultClassNames.selected,
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground"
        ),
        today: cn(defaultClassNames.today, "bg-accent text-accent-foreground [&>button]:bg-accent [&>button]:text-accent-foreground"),
        outside: cn(
          defaultClassNames.outside,
          "rdp-outside text-muted-foreground/50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground"
        ),
        disabled: cn(defaultClassNames.disabled, "text-muted-foreground opacity-50"),
        range_middle: cn(
          defaultClassNames.range_middle,
          "aria-selected:bg-accent aria-selected:text-accent-foreground"
        ),
        hidden: cn(defaultClassNames.hidden, "invisible"),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight
          return <Icon className="size-4" />
        },
      }}
      {...props}
    />
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
