import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import ReactEcs, { UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { hud } from './game'
import { cupsRemaining } from './table'
import { SPIN_MAX } from './config'

// Power bar reads green -> amber -> red as it fills, so peripheral vision is
// enough to release at the power you wanted.
function powerColor(p: number): Color4 {
  if (p < 0.5) return Color4.create(0.3, 0.9, 0.35, 1)
  if (p < 0.8) return Color4.create(1, 0.75, 0.15, 1)
  return Color4.create(1, 0.3, 0.2, 1)
}

const uiComponent = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
    {/* Score, top centre */}
    <UiEntity
      uiTransform={{
        width: 340,
        height: 76,
        positionType: 'absolute',
        position: { top: 24, left: '50%' },
        margin: { left: -170 },
        flexDirection: 'column',
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.45) }}
    >
      <Label
        value={`<b>${hud.made} / ${hud.thrown}</b>   ·   ${cupsRemaining()} cups left`}
        fontSize={26}
        color={Color4.White()}
      />
      <Label
        value={hud.lastResult ? `<b>${hud.lastResult}</b>` : ''}
        fontSize={22}
        color={hud.lastResult === 'CUP!' ? Color4.create(0.3, 1, 0.4, 1) : Color4.create(1, 0.5, 0.4, 1)}
      />
    </UiEntity>

    {/* Angle + spin readout, bottom left */}
    <UiEntity
      uiTransform={{
        width: 300,
        height: 96,
        positionType: 'absolute',
        position: { bottom: 150, left: 32 },
        flexDirection: 'column'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.4) }}
    >
      <Label
        value={`ANGLE  <b>${hud.angleDeg.toFixed(0)}°</b>   <color="#aaaaaa">E / F</color>`}
        fontSize={22}
        color={Color4.White()}
      />
      <Label
        value={`BACKSPIN  <b>${hud.spin.toFixed(0)}</b>   <color="#aaaaaa">1 / 2</color>`}
        fontSize={22}
        color={Color4.create(0.6, 0.85, 1, 1)}
      />
      <Label
        value={`look to aim left/right`}
        fontSize={16}
        color={Color4.create(0.7, 0.7, 0.7, 1)}
      />
    </UiEntity>

    {/* Power bar, bottom centre */}
    <UiEntity
      uiTransform={{
        width: 460,
        height: 40,
        positionType: 'absolute',
        position: { bottom: 80, left: '50%' },
        margin: { left: -230 }
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      <UiEntity
        uiTransform={{ width: `${Math.round(hud.power * 100)}%`, height: '100%' }}
        uiBackground={{ color: powerColor(hud.power) }}
      />
    </UiEntity>

    <UiEntity
      uiTransform={{
        width: 460,
        height: 30,
        positionType: 'absolute',
        position: { bottom: 44, left: '50%' },
        margin: { left: -230 },
        justifyContent: 'center'
      }}
    >
      <Label
        value={
          hud.state === 'charging'
            ? `<b>${Math.round(hud.power * 100)}%</b> — release to throw`
            : 'hold LEFT CLICK to charge'
        }
        fontSize={20}
        color={Color4.White()}
      />
    </UiEntity>
  </UiEntity>
)

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}
