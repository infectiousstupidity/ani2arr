// src/ui/MultiTagInput.tsx
import React, { useState, useMemo, useRef } from 'react';
import { Cross2Icon } from '@radix-ui/react-icons';

interface MultiTagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  existingTags?: string[];
}

const MultiTagInput: React.FC<MultiTagInputProps> = ({ value: tags, onChange, placeholder, disabled, existingTags = [] }) => {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tagToAdd: string) => {
    const newTag = tagToAdd.trim();
    if (newTag && !tags.includes(newTag)) {
      onChange([...tags, newTag]);
    }
    setInputValue('');
  };

  const removeTag = (indexToRemove: number) => {
    if (disabled) return;
    onChange(tags.filter((_, index) => index !== indexToRemove));
    inputRef.current?.focus(); // Keep focus in the component
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      e.preventDefault();
      removeTag(tags.length - 1);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleBlur = () => {
    // Delay closing to allow click events on suggestions to register
    setTimeout(() => {
      if (document.activeElement !== inputRef.current) {
        setIsOpen(false);
      }
    }, 150);
  };

  const suggestions = useMemo(() => {
    const lowerInputValue = inputValue.toLowerCase();
    
    // Filter out tags that are already selected
    const availableTags = existingTags.filter(
      tag => !tags.some(t => t.toLowerCase() === tag.toLowerCase())
    );

    // If there's input, filter based on it. Otherwise, show all available tags.
    if (inputValue) {
      return availableTags.filter(tag => tag.toLowerCase().includes(lowerInputValue));
    }
    
    return availableTags;
  }, [inputValue, existingTags, tags]);

  return (
    <div className="relative" onBlur={handleBlur}>
      <div 
        className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-accent-primary"
        onClick={() => inputRef.current?.focus()} // Focus the input when clicking the container
      >
        {tags.map((tag, index) => (
          <span key={index} className="flex items-center gap-1 rounded-sm bg-accent-primary/20 px-2 py-1 text-xs font-medium text-accent-primary">
            {tag}
            <button
              type="button"
              className="rounded-full outline-none focus:ring-2 focus:ring-accent-primary"
              onClick={() => removeTag(index)}
              disabled={disabled}
              aria-label={`Remove ${tag}`}
            >
              <Cross2Icon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="min-w-[80px] flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
          disabled={disabled}
        />
      </div>
      
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border-primary bg-bg-secondary p-1 shadow-lg">
          {suggestions.map(suggestion => (
            <li
              key={suggestion}
              className="cursor-pointer rounded-sm px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary"
              onMouseDown={(e) => {
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