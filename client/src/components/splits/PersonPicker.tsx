import { X, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUserSearch } from "@/hooks/useUserSearch";
import type { UserInfo } from "@/api/splitRequests";

export type Item = {
  toUser: UserInfo | null;
  freeName: string;
  betrag: string;
  searchInput: string;
  showDropdown: boolean;
};

interface PersonPickerProps {
  item: Item;
  index: number;
  knownPersons: string[];
  idPrefix: string;
  onChange: (idx: number, updates: Partial<Item>) => void;
}

export function PersonPicker({ item, index, knownPersons, idPrefix, onChange }: PersonPickerProps) {
  const { users, setInputValue } = useUserSearch();

  function handleInput(val: string) {
    onChange(index, { searchInput: val, showDropdown: !!val, toUser: null });
    setInputValue(val);
  }

  function selectUser(u: UserInfo) {
    onChange(index, { toUser: u, freeName: "", searchInput: u.name, showDropdown: false });
    setInputValue("");
  }

  function selectFreeName(name: string) {
    onChange(index, { toUser: null, freeName: name, searchInput: name, showDropdown: false });
    setInputValue("");
  }

  function clearSelection() {
    onChange(index, { toUser: null, freeName: "", searchInput: "", showDropdown: false });
    setInputValue("");
  }

  const hasSelection = item.toUser !== null || item.freeName.length > 0;
  const showList = item.showDropdown && item.searchInput.length >= 1;
  const listId = `${idPrefix}-known-${index}`;

  return (
    <div className="relative flex-1">
      {hasSelection ? (
        <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/30 text-sm">
          {item.toUser && <User className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
          <span className="flex-1 truncate font-medium">
            {item.toUser ? item.toUser.name : item.freeName}
          </span>
          {item.toUser && (
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">{item.toUser.email}</span>
          )}
          <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          {knownPersons.length > 0 && (
            <datalist id={listId}>
              {knownPersons.map((p) => <option key={p} value={p} />)}
            </datalist>
          )}
          <Input
            list={knownPersons.length > 0 ? listId : undefined}
            placeholder="Name oder E-Mail"
            value={item.searchInput}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => onChange(index, { showDropdown: true })}
            onBlur={() =>
              setTimeout(() => {
                onChange(index, {
                  showDropdown: false,
                  ...(item.searchInput.trim() && !item.toUser
                    ? { freeName: item.searchInput.trim() }
                    : {}),
                });
              }, 150)
            }
            className="h-9"
          />
          {showList && (
            <div className="absolute top-10 left-0 z-50 w-full rounded-lg border border-border bg-card shadow-lg max-h-44 overflow-y-auto">
              {users.map((u) => (
                <button
                  key={u.id}
                  className="w-full flex flex-col items-start px-3 py-2 text-left hover:bg-muted/50 transition-colors text-sm"
                  onMouseDown={() => selectUser(u)}
                >
                  <span className="font-medium">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </button>
              ))}
              {item.searchInput.length >= 1 && (
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors text-sm border-t border-border/60"
                  onMouseDown={() => selectFreeName(item.searchInput)}
                >
                  <span className="text-muted-foreground">Als freien Namen:</span>
                  <span className="font-medium">„{item.searchInput}"</span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}