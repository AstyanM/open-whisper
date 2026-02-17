import * as React from "react"
import { format, parseISO } from "date-fns"
import { CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  /** ISO date string (YYYY-MM-DD) or empty string */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selected = value ? parseISO(value) : undefined

  function handleSelect(date: Date | undefined) {
    if (date) {
      // Format as YYYY-MM-DD for the API
      onChange(format(date, "yyyy-MM-dd"))
    } else {
      onChange("")
    }
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    onChange("")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal h-8 px-2.5 gap-1.5",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 opacity-50" />
          <span className="truncate text-xs">
            {value ? format(parseISO(value), "MMM d, yyyy") : placeholder}
          </span>
          {value && (
            <X
              className="size-3 shrink-0 opacity-50 hover:opacity-100 ml-auto"
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
