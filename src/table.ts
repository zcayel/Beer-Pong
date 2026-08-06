// ---------------------------------------------------------------------------
// Table and cup rack, built from the real dimensions in config.ts.
//
// Cups are a modelled GLB; the table is still primitives. Every position here is
// derived from measured sizes rather than eyeballed, so swapping in a table model
// later needs no layout changes.
// ---------------------------------------------------------------------------

import { Vector3, Color4 } from '@dcl/sdk/math'
import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  GltfContainer,
  Entity,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import {
  TABLE_LENGTH,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_CENTER_X,
  TABLE_CENTER_Z,
  CUP_HEIGHT,
  CUP_MODEL_SCALE,
  CUP_SPACING,
  RACK_Z
} from './config'

const MODEL_CUP = 'assets/models/bpcup.glb'

export type Cup = {
  entity: Entity
  x: number
  z: number
  /** World Y of the cup rim — the plane a made shot has to cross. */
  rimY: number
  standing: boolean
}

export const cups: Cup[] = []

// Rows of a 10-cup rack sit sqrt(3)/2 * spacing apart (equilateral triangle).
const ROW_SPACING = (CUP_SPACING * Math.sqrt(3)) / 2

export function buildTable() {
  const top = engine.addEntity()
  Transform.create(top, {
    position: Vector3.create(TABLE_CENTER_X, TABLE_HEIGHT - 0.02, TABLE_CENTER_Z),
    scale: Vector3.create(TABLE_WIDTH, 0.04, TABLE_LENGTH)
  })
  MeshRenderer.setBox(top)
  // The cannon body only stops the BALL. MeshCollider is what stops the PLAYER —
  // without it you walk straight through the table.
  MeshCollider.setBox(top)
  Material.setPbrMaterial(top, { albedoColor: Color4.create(0.12, 0.35, 0.16, 1), roughness: 0.7 })

  // Four legs, inset from the corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = engine.addEntity()
      Transform.create(leg, {
        position: Vector3.create(
          TABLE_CENTER_X + sx * (TABLE_WIDTH / 2 - 0.05),
          TABLE_HEIGHT / 2,
          TABLE_CENTER_Z + sz * (TABLE_LENGTH / 2 - 0.05)
        ),
        scale: Vector3.create(0.05, TABLE_HEIGHT, 0.05)
      })
      MeshRenderer.setBox(leg)
      MeshCollider.setBox(leg)
      Material.setPbrMaterial(leg, { albedoColor: Color4.create(0.2, 0.2, 0.22, 1) })
    }
  }
}

/**
 * 10-cup triangle. Row 0 is the apex (single cup, nearest the thrower); row 3 is
 * the four-cup back row. That is the real orientation — the point faces you.
 */
export function buildRack() {
  for (const c of cups) {
    engine.removeEntity(c.entity)
  }
  cups.length = 0

  for (let row = 0; row < 4; row++) {
    const count = row + 1
    const z = RACK_Z - 1.5 * ROW_SPACING + row * ROW_SPACING
    for (let i = 0; i < count; i++) {
      const x = TABLE_CENTER_X + (i - row / 2) * CUP_SPACING
      cups.push(makeCup(x, z))
    }
  }
}

function makeCup(x: number, z: number): Cup {
  // Real modelled cup — genuinely open at the top, which no DCL primitive can be
  // (every primitive is a closed solid, so setCylinder always draws a lid). The
  // model's base sits at Y=0, so the entity goes straight on the table surface.
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(x, TABLE_HEIGHT, z),
    scale: Vector3.create(CUP_MODEL_SCALE, CUP_MODEL_SCALE, CUP_MODEL_SCALE)
  })
  GltfContainer.create(e, { src: MODEL_CUP })

  return { entity: e, x, z, rimY: TABLE_HEIGHT + CUP_HEIGHT, standing: true }
}

export function sinkCup(cup: Cup) {
  cup.standing = false
  VisibilityComponent.createOrReplace(cup.entity, { visible: false })
}

export function cupsRemaining(): number {
  return cups.filter((c) => c.standing).length
}
