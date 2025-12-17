// src/shared/components/multi-tag-input.tsx
import React, { useState, useMemo, useRef } from 'react';
import { X } from 'lucide-react';

interface MultiTagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  existingTags?: string[];

  id?: string;
  'aria-describedby'?: string;
}

const MultiTagInput: React.FC<MultiTagInputProps> = ({
  value: tags,
  onChange,
  placeholder,
  disabled,
  existingTags = [],
  id,
  'aria-describedby': ariaDescribedBy,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedTags = useMemo(
    () => tags.map((tag) => tag.toLowerCase()),
    [tags]
  );

  const existingTagMap = useMemo(
    () =>
      new Map(
        existingTags
          .filter(
            (tag): tag is string =>
              typeof tag === 'string' && tag.trim().length > 0
          )
          .map((tag) => [tag.toLowerCase(), tag])
      ),
    [existingTags]
  );

  const addTag = (tagToAdd: string): boolean => {
    const trimmed = tagToAdd.trim();
    if (!trimmed) return false;

    const normalized = trimmed.toLowerCase();
    const canonical = existingTagMap.get(normalized) ?? trimmed;

    if (normalizedTags.includes(canonical.toLowerCase())) {
      return false;
    }

    onChange([...tags, canonical]);
    setInputValue('');
    return true;
  };

  const removeTag = (tagToRemove: string) => {
    if (disabled) return;
    onChange(tags.filter((t) => t !== tagToRemove));
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === 'Enter' ||
      e.key === ' ' ||
      e.key === ',' ||
      e.key === 'Spacebar'
    ) {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      e.preventDefault();
      // Safe check to satisfy TypeScript
      const lastTag = tags[tags.length - 1];
      if (lastTag) {
        removeTag(lastTag);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleBlur = () => {
    // Small delay to allow click events on suggestions to fire before closing
    setTimeout(() => {
      if (document.activeElement !== inputRef.current) {
        setIsOpen(false);
      }
    }, 150);
  };

  const suggestions = useMemo(() => {
    const lowerInput = inputValue.toLowerCase();

    const availableTags = existingTags
      .filter(
        (tag): tag is string => typeof tag === 'string' && tag.trim().length > 0
      )
      .filter((tag) => !normalizedTags.includes(tag.toLowerCase()));

    if (inputValue) {
      return availableTags.filter((tag) =>
        tag.toLowerCase().includes(lowerInput)
      );
    }

    return availableTags;
  }, [inputValue, existingTags, normalizedTags]);

  return (
    <div className="relative" onBlur={handleBlur}>
      <div
        className="flex w-full min-h-[42px] flex-wrap items-center gap-2 rounded-md bg-bg-primary p-2 text-sm ring-offset-background"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-accent-primary/20 px-2 py-1 text-xs font-medium text-accent-primary"
          >
            {tag}
            <button
              type="button"
              className="rounded-full outline-none focus:ring-2 focus:ring-accent-primary/50"
              onClick={(e) => {
                e.stopPropagation(); // Prevent focusing the input immediately
                removeTag(tag);
              }}
              disabled={disabled}
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          autoComplete="off"
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md bg-bg-secondary p-1 shadow-lg border border-bg-tertiary"
        >
          {suggestions.map((suggestion) => (
            <li
              role="option"
              key={suggestion}
              className="cursor-pointer rounded-sm px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary"
              onMouseDown={(e) => {
                // Prevent input blur so click registers
                e.preventDefault();
                addTag(suggestion);
              }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MultiTagInput;