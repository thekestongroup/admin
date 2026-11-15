<script setup lang="ts">
import { FormField } from '@thekestongroup/ui'

// A multi-line field: Keston UI FormField around a textarea, e.g. one address per line.
defineOptions({ inheritAttrs: false })

defineProps<{
  modelValue?: string
  label: string
  helper?: string
  errorText?: string
  rows?: number
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <FormField :label="label" :helper="helper" :error-text="errorText" :disabled="disabled">
    <template #default="{ id, describedBy, invalid }">
      <textarea
        :id="id"
        :value="modelValue"
        v-bind="$attrs"
        :rows="rows ?? 3"
        :disabled="disabled"
        :aria-invalid="invalid"
        :aria-describedby="describedBy"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        class="min-w-0 flex-1 resize-y bg-transparent font-mono text-xs leading-5 outline-none placeholder:text-black/55 disabled:cursor-not-allowed"
      />
    </template>
  </FormField>
</template>
