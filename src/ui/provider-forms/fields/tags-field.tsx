import { FormField, Label } from '@/shared/ui/form/form';
import MultiTagInput from '@/shared/ui/form/multi-tag-input';

type TagsFieldProps = {
  disabled: boolean;
  value: string[];
  existingTags: string[];
  onChange: (labels: string[]) => void;
};

export const TagsField = (props: TagsFieldProps) => {
  const { disabled, value, existingTags, onChange } = props;

  return (
    <FormField>
      <div className="space-y-3">
        <Label>Tags</Label>
        <MultiTagInput
          value={value}
          onChange={onChange}
          placeholder="Add tags..."
          disabled={disabled}
          existingTags={existingTags}
        />
      </div>
    </FormField>
  );
};
