import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TreeNode = {
  id: string;
  name: string;
  type?: 'group' | 'item';
  children?: TreeNode[];
};

interface TreeViewProps {
  data: TreeNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function TreeView({ data, selectedId, onSelect, className }: TreeViewProps) {
  return (
    <div className={cn("w-full h-full overflow-y-auto pr-2", className)}>
      {data.map((node) => (
        <TreeNodeItem
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
          level={0}
        />
      ))}
    </div>
  );
}

function TreeNodeItem({
  node,
  selectedId,
  onSelect,
  level,
}: {
  node: TreeNode;
  selectedId?: string;
  onSelect: (id: string) => void;
  level: number;
}) {
  const [isOpen, setIsOpen] = useState(level === 0 || (node.children && node.children.some(c => c.id === selectedId)));
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center py-1.5 px-2 rounded-md cursor-pointer text-sm mb-0.5",
          isSelected ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) setIsOpen(!isOpen);
          onSelect(node.id);
        }}
      >
        <span className="w-4 h-4 mr-1 flex items-center justify-center">
          {hasChildren ? (
            isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
          ) : null}
        </span>
        <span className="w-4 h-4 mr-2 flex items-center justify-center opacity-80">
          {node.type === 'group' || hasChildren ? (
             isOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />
          ) : <Users className="w-3.5 h-3.5" />}
        </span>
        <span className="truncate">{node.name}</span>
      </div>
      
      {hasChildren && isOpen && (
        <div className="flex flex-col">
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
