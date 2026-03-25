import test from 'node:test';
import assert from 'node:assert/strict';
import { vttResponseSchema } from '../vtt-response-schema.js';

function validateStrictObjectSchema(schema, path = 'root') {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type === 'object' && schema.additionalProperties === false) {
    const propertyKeys = Object.keys(schema.properties || {});
    const required = Array.isArray(schema.required) ? schema.required : [];
    assert.deepEqual(
      [...required].sort(),
      [...propertyKeys].sort(),
      `${path} must require every property when additionalProperties is false`
    );
  }

  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      validateStrictObjectSchema(value, `${path}.properties.${key}`);
    }
  }

  if (schema.items) validateStrictObjectSchema(schema.items, `${path}.items`);

  if (Array.isArray(schema.anyOf)) {
    for (let index = 0; index < schema.anyOf.length; index += 1) {
      validateStrictObjectSchema(schema.anyOf[index], `${path}.anyOf[${index}]`);
    }
  }
}

test('VTT response schema keeps strict object required keys aligned with properties', () => {
  validateStrictObjectSchema(vttResponseSchema);
});
