import { stringify } from "yaml";
import { z } from "zod";
import { ResourceUidSchema, type ResourceUid } from "./resource-uid.js";

export const CASEGRAPH_RESOURCE_API_VERSION =
  "casegraph.policeconduct.org/v1alpha1" as const;

export interface CaseGraphResource {
  readonly apiVersion: typeof CASEGRAPH_RESOURCE_API_VERSION;
  readonly kind: string;
  readonly metadata: { readonly uid: ResourceUid };
  readonly spec: object;
  readonly status?: object;
}

export type ResourceCategory = "node" | "legal-effect-edge";

export type DeepReadonly<Value> = Value extends
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export interface ResourceInspection<
  Resource extends CaseGraphResource = CaseGraphResource,
> {
  readonly resource: DeepReadonly<Resource>;
  readonly category: ResourceCategory;
  readonly resourceReferences: readonly ResourceUid[];
  readonly ownedPaths: readonly string[];
}

export interface ResourceKindDefinition<
  Resource extends CaseGraphResource = CaseGraphResource,
> {
  readonly apiVersion: typeof CASEGRAPH_RESOURCE_API_VERSION;
  readonly kind: string;
  readonly category: ResourceCategory;
  read(value: unknown): Resource;
  inspect(value: unknown): ResourceInspection<Resource>;
  serialize(value: unknown): string;
}

type DefinedResource<
  Kind extends string,
  SpecShape extends z.ZodRawShape,
  StatusShape extends z.ZodRawShape | undefined,
> = {
  readonly apiVersion: typeof CASEGRAPH_RESOURCE_API_VERSION;
  readonly kind: Kind;
  readonly metadata: { readonly uid: ResourceUid };
  readonly spec: z.output<z.ZodObject<SpecShape>>;
} & (StatusShape extends z.ZodRawShape
  ? { readonly status: z.output<z.ZodObject<StatusShape>> }
  : object);

interface DefineResourceKindOptions<
  Kind extends string,
  SpecShape extends z.ZodRawShape,
  StatusShape extends z.ZodRawShape | undefined,
> {
  readonly kind: Kind;
  readonly category: ResourceCategory;
  readonly spec: SpecShape;
  readonly status?: StatusShape;
  readonly resourceReferences?: (
    resource: DeepReadonly<DefinedResource<Kind, SpecShape, StatusShape>>,
  ) => readonly ResourceUid[];
  readonly ownedPaths?: (
    resource: DeepReadonly<DefinedResource<Kind, SpecShape, StatusShape>>,
  ) => readonly string[];
}

export function defineResourceKind<
  Kind extends string,
  SpecShape extends z.ZodRawShape,
  StatusShape extends z.ZodRawShape | undefined = undefined,
>(
  options: DefineResourceKindOptions<Kind, SpecShape, StatusShape>,
): ResourceKindDefinition<DefinedResource<Kind, SpecShape, StatusShape>> {
  const metadataSchema = z.strictObject({ uid: ResourceUidSchema });
  const specSchema = z.strictObject(options.spec);
  const resourceSchema =
    options.status === undefined
      ? z.strictObject({
          apiVersion: z.literal(CASEGRAPH_RESOURCE_API_VERSION),
          kind: z.literal(options.kind),
          metadata: metadataSchema,
          spec: specSchema,
        })
      : z.strictObject({
          apiVersion: z.literal(CASEGRAPH_RESOURCE_API_VERSION),
          kind: z.literal(options.kind),
          metadata: metadataSchema,
          spec: specSchema,
          status: z.strictObject(options.status),
        });

  function read(value: unknown): DefinedResource<Kind, SpecShape, StatusShape> {
    return resourceSchema.parse(value) as DefinedResource<
      Kind,
      SpecShape,
      StatusShape
    >;
  }

  function freezeRecursively<Value>(value: Value): DeepReadonly<Value> {
    if (typeof value !== "object" || value === null) {
      return value as DeepReadonly<Value>;
    }

    for (const nestedValue of Object.values(value)) {
      freezeRecursively(nestedValue);
    }

    return Object.freeze(value) as DeepReadonly<Value>;
  }

  return {
    apiVersion: CASEGRAPH_RESOURCE_API_VERSION,
    kind: options.kind,
    category: options.category,
    read,
    inspect(value: unknown) {
      const resource = freezeRecursively(read(value));
      const resourceReferences = Object.freeze([
        ...(options.resourceReferences?.(resource) ?? []),
      ]);
      const ownedPaths = Object.freeze([
        ...(options.ownedPaths?.(resource) ?? []),
      ]);

      return Object.freeze({
        resource,
        category: options.category,
        resourceReferences,
        ownedPaths,
      });
    },
    serialize(value: unknown): string {
      return stringify(read(value));
    },
  };
}

export interface ResourceRegistry {
  read(value: unknown, resourcePath: string): CaseGraphResource;
  inspect(value: unknown, resourcePath: string): ResourceInspection;
  serialize(value: unknown, resourcePath: string): string;
}

export function createResourceRegistry(
  definitions: readonly ResourceKindDefinition[],
): ResourceRegistry {
  const definitionsByKey = new Map<string, ResourceKindDefinition>();

  for (const definition of definitions) {
    const key = `${definition.apiVersion}\u0000${definition.kind}`;
    if (definitionsByKey.has(key)) {
      throw new Error(
        `Duplicate CaseGraph resource registration: ${definition.apiVersion} ${definition.kind}`,
      );
    }
    definitionsByKey.set(key, definition);
  }

  function select(
    value: unknown,
    resourcePath: string,
  ): ResourceKindDefinition {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(
        `Invalid CaseGraph resource selectors at ${resourcePath}: expected an object`,
      );
    }

    const selectors = value as Record<string, unknown>;
    if (typeof selectors.apiVersion !== "string") {
      throw new Error(
        `Invalid CaseGraph resource API version at ${resourcePath}: expected a string`,
      );
    }
    if (typeof selectors.kind !== "string") {
      throw new Error(
        `Invalid CaseGraph resource kind at ${resourcePath}: expected a string`,
      );
    }

    if (selectors.apiVersion !== CASEGRAPH_RESOURCE_API_VERSION) {
      throw new Error(
        `Unknown CaseGraph resource API version ${selectors.apiVersion} at ${resourcePath}`,
      );
    }

    const definition = definitionsByKey.get(
      `${selectors.apiVersion}\u0000${selectors.kind}`,
    );
    if (definition === undefined) {
      throw new Error(
        `Unknown CaseGraph resource kind ${selectors.kind} at ${resourcePath}`,
      );
    }
    return definition;
  }

  function read(value: unknown, resourcePath: string): CaseGraphResource {
    const definition = select(value, resourcePath);
    try {
      return definition.read(value);
    } catch (error) {
      throw new Error(`Invalid CaseGraph resource at ${resourcePath}`, {
        cause: error,
      });
    }
  }

  return {
    read,
    inspect(value: unknown, resourcePath: string): ResourceInspection {
      const definition = select(value, resourcePath);
      try {
        return definition.inspect(value);
      } catch (error) {
        throw new Error(`Invalid CaseGraph resource at ${resourcePath}`, {
          cause: error,
        });
      }
    },
    serialize(value: unknown, resourcePath: string): string {
      const definition = select(value, resourcePath);
      try {
        return definition.serialize(value);
      } catch (error) {
        throw new Error(`Invalid CaseGraph resource at ${resourcePath}`, {
          cause: error,
        });
      }
    },
  };
}
