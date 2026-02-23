import * as React from "react";
import { Check, ChevronsUpDown, UserCheck } from "lucide-react";
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

export interface HikVisitor {
  visitorId: string;
  personName: string;
  phoneNo: string | null;
  certificateNo: string | null;
  email: string | null;
  plateNo: string | null;
}

interface HikVisitorComboboxProps {
  visitors: HikVisitor[];
  value: string;
  onSelect: (visitor: HikVisitor | null) => void;
  placeholder?: string;
  loading?: boolean;
}

export function HikVisitorCombobox({
  visitors,
  value,
  onSelect,
  placeholder = "Buscar visitante cadastrado no HikCentral...",
  loading = false,
}: HikVisitorComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selected = visitors.find((v) => v.visitorId === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={loading}
        >
          {loading ? (
            <span className="text-muted-foreground">Carregando visitantes...</span>
          ) : selected ? (
            <span className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-green-600" />
              {selected.personName}
              {selected.certificateNo && (
                <span className="text-muted-foreground text-xs">
                  — {selected.certificateNo}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite o nome do visitante..." />
          <CommandList>
            <CommandEmpty>Nenhum visitante encontrado no HikCentral.</CommandEmpty>
            <CommandGroup heading="Visitantes HikCentral">
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onSelect(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="text-muted-foreground">Novo visitante (cadastro manual)</span>
              </CommandItem>
              {visitors.map((visitor) => (
                <CommandItem
                  key={visitor.visitorId}
                  value={`${visitor.personName} ${visitor.certificateNo || ''} ${visitor.phoneNo || ''}`}
                  onSelect={() => {
                    onSelect(visitor);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === visitor.visitorId ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{visitor.personName}</span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        visitor.certificateNo && `Doc: ${visitor.certificateNo}`,
                        visitor.phoneNo && `Tel: ${visitor.phoneNo}`,
                        visitor.plateNo && `Placa: ${visitor.plateNo}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sem detalhes adicionais"}
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
