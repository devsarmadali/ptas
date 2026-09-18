export type JurisdictionType = "REGION" | "DISTRICT" | "OFFICE" | "CIRCLE";

export interface Jurisdiction {
  readonly id: string;
  readonly type: JurisdictionType;
  readonly code: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly activeFrom: string; // ISO date YYYY-MM-DD
  readonly activeTo?: string | null; // ISO date YYYY-MM-DD
}

export interface HierarchyValidationError {
  readonly jurisdictionId: string;
  readonly code: string;
  readonly message: string;
}

export interface HierarchyValidationResult {
  readonly valid: boolean;
  readonly errors: readonly HierarchyValidationError[];
}

const EXPECTED_PARENT_TYPE: Record<JurisdictionType, JurisdictionType | null> = {
  REGION: null,
  DISTRICT: "REGION",
  OFFICE: "DISTRICT",
  CIRCLE: "OFFICE"
};

export function isJurisdictionActive(jurisdiction: Jurisdiction, asOfDate: string | Date): boolean {
  const asOfStr = asOfDate instanceof Date ? asOfDate.toISOString().slice(0, 10) : asOfDate;
  if (asOfStr < jurisdiction.activeFrom) return false;
  if (jurisdiction.activeTo && asOfStr > jurisdiction.activeTo) return false;
  return true;
}

export function validateJurisdictionHierarchy(
  nodes: readonly Jurisdiction[]
): HierarchyValidationResult {
  const errors: HierarchyValidationError[] = [];
  const nodeMap = new Map<string, Jurisdiction>();
  const typeCodeSet = new Set<string>();

  for (const node of nodes) {
    if (nodeMap.has(node.id)) {
      errors.push({
        jurisdictionId: node.id,
        code: "DUPLICATE_ID",
        message: `Duplicate jurisdiction id: ${node.id}`
      });
    }
    nodeMap.set(node.id, node);

    const typeCodeKey = `${node.type}:${node.code.toUpperCase()}`;
    if (typeCodeSet.has(typeCodeKey)) {
      errors.push({
        jurisdictionId: node.id,
        code: "DUPLICATE_TYPE_CODE",
        message: `Duplicate code "${node.code}" for jurisdiction type "${node.type}"`
      });
    }
    typeCodeSet.add(typeCodeKey);

    if (node.activeTo && node.activeTo < node.activeFrom) {
      errors.push({
        jurisdictionId: node.id,
        code: "INVALID_DATE_RANGE",
        message: `activeTo (${node.activeTo}) is earlier than activeFrom (${node.activeFrom}) for jurisdiction ${node.id}`
      });
    }
  }

  for (const node of nodes) {
    const expectedParentType = EXPECTED_PARENT_TYPE[node.type];

    if (expectedParentType === null) {
      if (node.parentId !== null) {
        errors.push({
          jurisdictionId: node.id,
          code: "INVALID_PARENT",
          message: `${node.type} jurisdiction must not have a parent, but references ${node.parentId}`
        });
      }
    } else {
      if (!node.parentId) {
        errors.push({
          jurisdictionId: node.id,
          code: "MISSING_PARENT",
          message: `${node.type} jurisdiction must have a parent of type ${expectedParentType}`
        });
        continue;
      }

      const parent = nodeMap.get(node.parentId);
      if (!parent) {
        errors.push({
          jurisdictionId: node.id,
          code: "PARENT_NOT_FOUND",
          message: `Parent jurisdiction ${node.parentId} not found in node set`
        });
        continue;
      }

      if (parent.type !== expectedParentType) {
        errors.push({
          jurisdictionId: node.id,
          code: "INVALID_PARENT_TYPE",
          message: `${node.type} jurisdiction must have parent of type ${expectedParentType}, but parent is ${parent.type}`
        });
      }

      if (node.activeFrom < parent.activeFrom) {
        errors.push({
          jurisdictionId: node.id,
          code: "ACTIVE_BEFORE_PARENT",
          message: `Child activeFrom (${node.activeFrom}) cannot be earlier than parent activeFrom (${parent.activeFrom})`
        });
      }

      if (parent.activeTo) {
        if (!node.activeTo || node.activeTo > parent.activeTo) {
          errors.push({
            jurisdictionId: node.id,
            code: "ACTIVE_AFTER_PARENT",
            message: `Child active period extends beyond parent activeTo (${parent.activeTo})`
          });
        }
      }
    }

    // Cycle check
    const visited = new Set<string>([node.id]);
    let curr = node.parentId ? nodeMap.get(node.parentId) : null;
    while (curr) {
      if (visited.has(curr.id)) {
        errors.push({
          jurisdictionId: node.id,
          code: "CIRCULAR_REFERENCE",
          message: `Circular parent relationship detected at jurisdiction ${curr.id}`
        });
        break;
      }
      visited.add(curr.id);
      curr = curr.parentId ? nodeMap.get(curr.parentId) : null;
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function getJurisdictionAncestors(
  jurisdictionId: string,
  nodes: readonly Jurisdiction[]
): readonly Jurisdiction[] {
  const nodeMap = new Map<string, Jurisdiction>(nodes.map((n) => [n.id, n]));
  const ancestors: Jurisdiction[] = [];
  let curr = nodeMap.get(jurisdictionId);

  while (curr?.parentId) {
    const parent = nodeMap.get(curr.parentId);
    if (!parent) break;
    ancestors.push(parent);
    curr = parent;
  }

  return ancestors;
}

export function getJurisdictionDescendantIds(
  jurisdictionId: string,
  nodes: readonly Jurisdiction[]
): readonly string[] {
  const childrenMap = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId) {
      const existing = childrenMap.get(node.parentId) ?? [];
      existing.push(node.id);
      childrenMap.set(node.parentId, existing);
    }
  }

  const results: string[] = [];
  const queue = [jurisdictionId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    results.push(currentId);
    const children = childrenMap.get(currentId);
    if (children) {
      queue.push(...children);
    }
  }

  return results;
}

export function isDescendantOrSelf(
  targetId: string,
  baseId: string,
  nodes: readonly Jurisdiction[]
): boolean {
  if (targetId === baseId) return true;
  const nodeMap = new Map<string, Jurisdiction>(nodes.map((n) => [n.id, n]));
  let curr = nodeMap.get(targetId);

  while (curr?.parentId) {
    if (curr.parentId === baseId) return true;
    curr = nodeMap.get(curr.parentId);
  }

  return false;
}
