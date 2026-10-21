"use client"

import { Button } from "@/components/ui/button"
import { Minus, Plus, Printer } from "lucide-react"

interface ZoomControlsProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

export function ZoomControls({ zoom, onZoomChange }: ZoomControlsProps) {
  function handlePrint() {
    window.print()
  }

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-[hsl(215,30%,18%)] rounded-lg px-3 py-2 shadow-lg border border-[hsl(215,15%,30%)] no-print">
      <Button
        size="sm"
        variant="ghost"
        onClick={handlePrint}
        className="h-7 px-2 text-[hsl(0,0%,80%)] hover:text-[hsl(0,0%,100%)] hover:bg-[hsl(215,25%,25%)]"
        title="Imprimir"
      >
        <Printer className="h-4 w-4" />
      </Button>

      <div className="w-px h-5 bg-[hsl(215,15%,35%)]" />

      <span className="text-[10px] text-[hsl(215,10%,60%)]">Zoom:</span>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => onZoomChange(Math.max(0.3, zoom - 0.1))}
        className="h-6 w-6 p-0 text-[hsl(0,0%,80%)] hover:text-[hsl(0,0%,100%)] hover:bg-[hsl(215,25%,25%)]"
      >
        <Minus className="h-3 w-3" />
      </Button>

      <span className="text-xs text-[hsl(0,0%,90%)] min-w-[3ch] text-center font-mono">
        {Math.round(zoom * 100)}%
      </span>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => onZoomChange(Math.min(1.5, zoom + 0.1))}
        className="h-6 w-6 p-0 text-[hsl(0,0%,80%)] hover:text-[hsl(0,0%,100%)] hover:bg-[hsl(215,25%,25%)]"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  )
}
