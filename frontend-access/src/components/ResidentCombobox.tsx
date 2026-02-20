import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Resident {
  id: string;
  full_name: string;
  unit_number: string;
  block: string | null;
  tower: string | null;
}

interface ResidentComboboxProps {
  residents: Resident[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function ResidentCombobox({
  residents,
  value,
  onValueChange,
  placeholder = "Selecione o morador..."
}: ResidentComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedResident = residents.find((resident) => resident.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedResident ? (
            <span>
              {selectedResident.full_name} - Unidade{" "}
              {selectedResident.block ? `${selectedResident.block}-` : ""}
              {selectedResident.unit_number}
              {selectedResident.tower ? ` (${selectedResident.tower})` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite o nome do morador..." />
          <CommandList>
            <CommandEmpty>Nenhum morador encontrado.</CommandEmpty>
            <CommandGroup>
              {residents.map((resident) => (
                <CommandItem
                  key={resident.id}
                  value={`${resident.full_name} ${resident.unit_number} ${resident.block || ''} ${resident.tower || ''}`}
                  onSelect={() => {
                    onValueChange(resident.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === resident.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{resident.full_name}</span>
                    <span className="text-sm text-muted-foreground">
                      Unidade {resident.block ? `${resident.block}-` : ""}
                      {resident.unit_number}
                      {resident.tower ? ` - ${resident.tower}` : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
