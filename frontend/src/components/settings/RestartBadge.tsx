import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function RestartBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="ml-2 text-[10px] text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
        >
          Restart
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Changing this requires a restart to take effect</TooltipContent>
    </Tooltip>
  );
}
