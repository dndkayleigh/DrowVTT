const OSS_VTT_SHELL_HTML = String.raw`<div class="app">
  <aside class="leftRail" aria-label="Board tools">
    <nav class="railNav" aria-label="Control sections">
      <button type="button" class="railButton" data-sidebar-section-target="session" aria-controls="sessionSection" aria-pressed="false">
        <span class="railButtonGlyph" aria-hidden="true">S</span>
        <span class="railButtonLabel">Session</span>
      </button>
      <button type="button" class="railButton" data-sidebar-section-target="map" aria-controls="mapSection" aria-pressed="false">
        <span class="railButtonGlyph" aria-hidden="true">M</span>
        <span class="railButtonLabel">Map</span>
      </button>
      <button type="button" class="railButton" data-sidebar-section-target="tokens" aria-controls="tokensSection" aria-pressed="false">
        <span class="railButtonGlyph" aria-hidden="true">T</span>
        <span class="railButtonLabel">Tokens</span>
      </button>
      <button type="button" class="railButton" data-sidebar-section-target="turn" aria-controls="turnSection" aria-pressed="false">
        <span class="railButtonGlyph" aria-hidden="true">R</span>
        <span class="railButtonLabel">Turn</span>
      </button>
      <button type="button" class="railButton" data-sidebar-section-target="ai" aria-controls="aiSection" aria-pressed="false">
        <span class="railButtonGlyph" aria-hidden="true">A</span>
        <span class="railButtonLabel">Tactics</span>
      </button>
    </nav>
  </aside>

  <aside class="contextDrawer" id="contextDrawer" data-open="false" aria-label="Board controls">
    <div class="contextDrawerFrame">
      <div class="contextDrawerHeader">
        <div class="contextDrawerTitleBlock">
          <div class="subtleLabel">Controls</div>
          <div class="contextDrawerTitle" id="contextDrawerTitle">Session</div>
        </div>
        <button type="button" class="contextDrawerClose" id="contextDrawerClose" aria-label="Close controls">Close</button>
      </div>
      <div class="sidebar contextDrawerPanels">
        __SIDEBAR_AFTER_BRAND_HTML__
        <details class="panelSection drawerSection" id="sessionSection" data-sidebar-section="session" open>
          <summary><h2>Session</h2></summary>
          <div class="card">
            <div class="saveSlotGrid legacySaveSlotsUi" aria-hidden="true">
              <div>
                <label for="saveSlotSelect">Saved boards</label>
                <select id="saveSlotSelect">
                  <option value="">(no saves yet)</option>
                </select>
              </div>
            </div>
            <div class="saveSlotActions legacySaveSlotsUi" aria-hidden="true">
              <button id="saveSlotBtn">Save Slot</button>
              <button id="loadSlotBtn">Load Slot</button>
              <button id="deleteSlotBtn" class="danger">Delete Slot</button>
            </div>
            <div class="checkRow legacySaveSlotsUi" style="margin-top:10px" aria-hidden="true">
              <input id="autosaveEnabled" type="checkbox" />
              <label for="autosaveEnabled" style="margin:0;color:var(--muted)">Autosave changes</label>
            </div>
            <div class="subcard">
              <div class="subtleLabel">Session Name</div>
              <label for="saveSlotName">Session name</label>
              <input id="saveSlotName" type="text" value="" maxlength="48" />
            </div>
            <div class="subcard">
              <div class="subtleLabel">Encounter Description</div>
              <label for="encounterDescription">Encounter description and intended behavior</label>
              <textarea id="encounterDescription" rows="5" placeholder="Describe the encounter and what tactically correct behavior should look like. This is exported into tactical fixtures."></textarea>
            </div>
            <div class="saveSlotActions">
              <button id="exportBoardBtn">Download Save</button>
              <button id="exportTacticalFixtureBtn">Export Tactical Fixture</button>
              <button id="importBoardBtn">Open Save</button>
            </div>
            <div class="autosaveRow">
              <div>
                <label for="autosaveSelect">Autosave history</label>
                <select id="autosaveSelect">
                  <option value="">(no autosaves yet)</option>
                </select>
              </div>
              <div class="saveSlotActions">
                <button id="restoreAutosaveBtn">Recover</button>
                <button id="clearAutosavesBtn" class="danger">Clear</button>
              </div>
            </div>
            <input id="importBoardFile" type="file" accept="application/json,.json" hidden />
            <div class="pill saveStatus" id="saveStateStatus" style="margin-top:10px">Save slot empty</div>
            <div class="sectionNote">
              Name the current session here. Download Save remains the primary way to keep a board, and autosave keeps a rolling local recovery history in this browser.
            </div>
          </div>
        </details>
        <details class="panelSection drawerSection" id="mapSection" data-sidebar-section="map" open>
      <summary><h2>Map & Grid</h2></summary>
      <div class="card">
        <div class="row">
          <div>
            <label>Load map image</label>
            <div class="filePicker">
              <label class="fileTrigger" for="mapFile">Choose map image</label>
              <input id="mapFile" type="file" accept="image/*" hidden />
              <div class="fileMeta" id="mapFileMeta">No map selected.</div>
            </div>
          </div>
        </div>
        <input id="gridSize" type="number" min="10" max="200" step="1" value="64" hidden />

        <div class="row" style="margin-top:10px;" hidden>
          <div>
            <label>Snap</label>
            <select id="snapMode">
              <option value="center">Token to cell center</option>
              <option value="topleft">Token to cell top-left</option>
            </select>
          </div>
          <div>
            <label>Nudge (cells)</label>
            <input id="nudgeCells" type="number" min="0.1" step="0.1" value="0.5" />
          </div>
        </div>
        <div class="subcard">
          <div class="subtleLabel">Manual Calibration</div>
          <div class="compactRow" style="margin-bottom:10px;">
            <div>
              <label for="calibrationGridSize">Grid size (px)</label>
              <input id="calibrationGridSize" type="number" min="10" max="200" step="1" value="64" />
            </div>
            <div>
              <label for="horizontalNudgePx">X offset (px)</label>
              <input id="horizontalNudgePx" type="number" step="1" value="32" />
            </div>
            <div>
              <label for="verticalNudgePx">Y offset (px)</label>
              <input id="verticalNudgePx" type="number" step="1" value="32" />
            </div>
          </div>
          <div class="btnbar">
            <button id="startCalibrationBtn" type="button" class="primary">Start calibration</button>
            <button id="cancelCalibrationBtn" type="button">Cancel</button>
          </div>
          <div class="sectionNote" id="gridCalibrationNote">Load a map, then click Start calibration to measure one cell and shift the map onto the grid.</div>
        </div>

        <div class="mapControlsGrid">
          <div class="subcard">
            <div class="subtleLabel">Board Tools</div>
            <div class="mapToolbar">
              <button id="resetView">Reset view</button>
              <button id="dragModeBtn" class="primary">Drag: Tokens</button>
              <button id="fitMap" class="primary">Fit map</button>
            </div>
            <div class="checkRow" style="margin-top:10px">
              <input id="showBoardStatus" type="checkbox" />
              <label for="showBoardStatus" style="margin:0;color:var(--muted)">Show board status overlay</label>
            </div>
          </div>

          <div class="subcard">
            <div class="subtleLabel">Blocking Edges</div>
            <div class="mapToolbar">
              <button id="blockingDrawBtn" type="button" aria-pressed="false">Draw blocking</button>
              <button id="blockingEraseBtn" type="button" aria-pressed="false">Erase blocking</button>
              <button id="blockingClearBtn" type="button" class="danger">Clear</button>
            </div>
            <div class="sectionNote" id="blockingCount">0 blocking edges</div>
          </div>

          <div class="subcard nudgeCard" hidden>
            <div class="subtleLabel">Map Alignment</div>
            <div class="nudgeHeader">
              <div class="miniField">
                <label for="mapScale">Scale</label>
                <input id="mapScale" type="number" min="0.1" step="0.01" value="1" />
              </div>
              <div class="miniField">
                <label for="mapRotDeg">Rotate</label>
                <input id="mapRotDeg" type="number" min="-10" max="10" step="0.05" value="0" />
              </div>
              <div class="miniField">
                <label for="mapOpacity">Opacity</label>
                <input id="mapOpacity" type="number" min="0.05" max="1" step="0.05" value="1" />
              </div>
            </div>
            <div class="nudgeButtons">
              <button id="nudgeLeft">◀ Left</button>
              <button id="nudgeRight">Right ▶</button>
              <button id="nudgeUp">▲ Up</button>
              <button id="nudgeDown">Down ▼</button>
            </div>
          </div>
        </div>

        <div class="sectionNote">
          Pan with <span class="kbd">Space</span> + drag. Zoom with the wheel.
          Use calibration to measure a cell and shift the map onto the grid.
        </div>
      </div>
    </details>

    <details class="panelSection drawerSection" id="tokensSection" data-sidebar-section="tokens">
      <summary><h2>Tokens</h2></summary>
      <div class="card">
        <div class="subcard">
          <div class="subtleLabel">Add Token</div>
          <div class="tokenFormRow">
            <div>
              <label>Name</label>
              <div class="fieldStack">
                <input id="tokName" type="text" value="Goblin" autocomplete="off" />
                <div class="autocompleteMenu" id="monsterAutocomplete" hidden></div>
              </div>
            </div>
            <div>
              <label>Type</label>
              <select id="tokType">
                <option value="NPC">NPC</option>
                <option value="Monster" selected>Monster</option>
                <option value="PC">PC</option>
              </select>
            </div>
            <div>
              <label>Size (cells)</label>
              <select id="tokSize">
                <option value="1" selected>1×1</option>
                <option value="2">2×2</option>
                <option value="3">3×3</option>
              </select>
            </div>
            <div>
              <label>Color</label>
              <select id="tokColor">
                <option value="#5aa9ff">Blue</option>
                <option value="#7dffb2">Green</option>
                <option value="#ffd36a">Gold</option>
                <option value="#ff5a7a" selected>Red</option>
                <option value="#caa7ff">Purple</option>
              </select>
            </div>
          </div>

          <div class="btnbar" style="margin-top:10px;">
            <button id="addToken" class="primary">Add token</button>
          </div>
        </div>

        <div class="subcard">
          <div class="subtleLabel">Roster</div>
          <div class="btnbar" style="margin-top:10px;">
            <button id="deleteSelectedTokens" class="danger">Delete Selected</button>
            <button id="clearTokens" class="danger">Clear all</button>
            <button id="mobileGroupSelectBtn" type="button">Group Select</button>
            <button id="clearAiGroup">Clear Group</button>
          </div>
          <div class="list" id="tokenList"></div>
          <div class="footerNote" id="tokenSelectionNote">Single modes use one selected monster. Group mode uses the selected monster group.</div>
        </div>
      </div>
    </details>

    <details class="panelSection drawerSection" id="turnSection" data-sidebar-section="turn">
      <summary><h2>Turn</h2></summary>
      <div class="card">
        <div class="row">
          <div>
            <label>Current token</label>
            <select id="turnToken"></select>
          </div>
        </div>

        <div class="turnTabs" role="tablist" aria-label="Current token details">
          <button type="button" class="tabBtn active" data-turn-tab="stats">Token Stats</button>
          <button type="button" class="tabBtn" data-turn-tab="notes">Notes</button>
          <button type="button" class="tabBtn" data-turn-tab="statblock">Statblock</button>
        </div>

        <div class="tabPanel" data-turn-panel="stats">
          <div class="compactRow">
            <div>
              <label>AC</label>
              <input id="selAC" type="number" min="1" step="1" value="15" />
            </div>
            <div>
              <label>HP</label>
              <input id="selHP" type="text" value="7/7" />
            </div>
            <div>
              <label>Speed ft</label>
              <input id="selSpeed" type="number" min="0" step="5" value="30" />
            </div>
          </div>
          <div class="compactRow" style="margin-top:8px;">
            <div>
              <label>Size</label>
              <select id="selSize">
                <option value="1">1×1</option>
                <option value="2">2×2</option>
                <option value="3">3×3</option>
                <option value="4">4×4</option>
              </select>
            </div>
            <div>
              <label>Color</label>
              <select id="selColor">
                <option value="#5aa9ff">Blue</option>
                <option value="#7dffb2">Green</option>
                <option value="#ffd36a">Gold</option>
                <option value="#ff5a7a">Red</option>
                <option value="#caa7ff">Purple</option>
              </select>
            </div>
          </div>
        </div>

        <div class="tabPanel" data-turn-panel="notes" hidden>
          <label>Notes</label>
          <textarea id="selNotes" spellcheck="false"></textarea>
        </div>

        <div class="tabPanel" data-turn-panel="statblock" hidden>
          <label>Statblock / actions</label>
          <textarea id="selStatblock" spellcheck="false"></textarea>
        </div>

        <div class="sectionNote" id="turnRuleNote">
          These fields edit the current token. Movement obeys turn, speed, and overlap rules.
        </div>
      </div>
    </details>

    <details class="panelSection drawerSection aiSection" id="aiSection" data-sidebar-section="ai">
      <summary><h2>Tactics Director</h2></summary>
      <div class="card">
        <div class="drawerLead">Run Tactics Director, review its plan, adjust settings, and check the log here.</div>
        <div class="drawerActions">
          <button id="sendState" class="primary">Run Tactics</button>
          <div class="checkRow">
            <input id="autoApplyAI" type="checkbox" checked />
            <label for="autoApplyAI" style="margin:0;color:var(--muted)">Autopilot</label>
          </div>
          <div class="small statusRow" id="sendStatus"></div>
        </div>
        <div class="decisionCard" id="decisionSummaryCard" hidden>
          <div class="subtleLabel">Narrator's Cue</div>
          <div class="small decisionText" id="decisionSummary"></div>
        </div>
        <div class="drawerTabs" role="tablist" aria-label="AI drawer panels">
          <button type="button" class="tabBtn" data-drawer-tab="packet">Packet</button>
          <button type="button" class="tabBtn" data-drawer-tab="settings">Settings</button>
          <button type="button" class="tabBtn" data-drawer-tab="apply">Apply</button>
          <button type="button" class="tabBtn" data-drawer-tab="log">Log</button>
        </div>
        <div class="drawerPanel" data-drawer-panel="packet" hidden>
          <div class="subcard">
            <div class="subtleLabel">Packet</div>
            <label>Turn packet</label>
            <textarea id="aiExport" spellcheck="false"></textarea>
            <div class="btnbar" style="margin-top:10px;">
              <button id="copyExport" class="primary">Copy</button>
              <button id="refreshExport">Refresh</button>
            </div>
          </div>
        </div>
        <div class="drawerPanel" data-drawer-panel="settings" hidden>
          <div class="subcard">
            <div class="subtleLabel">Settings</div>
            __BACKEND_ENDPOINT_HTML__
            <div style="margin-top:8px;">
              <label>Tactics Mode</label>
              <select id="aiStrategy">
                <option value="controller_scripted">Scripted</option>
                <option value="controller_utility">Utility</option>
                <option value="controller_supervisor_scripted">Supervisor</option>
              </select>
              <label style="margin-top:8px;">Activation Scope</label>
              <select id="aiActivationScope">
                <option value="single">Current Token</option>
                <option value="group">Selected Group</option>
              </select>
              <div class="sectionNote" id="aiStrategyHint" style="margin-top:8px;"></div>
            </div>
          </div>
        </div>
        <div class="drawerPanel" data-drawer-panel="apply" hidden>
          <div class="subcard">
            <div class="subtleLabel">Apply</div>
            <label>Apply JSON</label>
            <textarea id="applyJson" spellcheck="false" placeholder='{"moves":[...],"actions":[...],"end_turn":true}'></textarea>
            <div class="btnbar" style="margin-top:10px;">
              <button id="applyBtn" class="primary">Apply</button>
            </div>
            <div class="small statusRow" id="applyStatus" style="margin-top:8px;"></div>
          </div>
        </div>
        <div class="drawerPanel" data-drawer-panel="log" hidden>
          <div class="subcard">
            <div class="subtleLabel">Log</div>
            <div class="btnbar">
              <button id="clearLog">Clear log</button>
            </div>
            <div class="small logBox" style="margin-top:10px;white-space:pre-wrap" id="logBox"></div>
          </div>
        </div>
      </div>
    </details>
      </div>
    </div>
  </aside>

  <main class="stageWrap">
    <div class="topbar" id="boardStatusBar" hidden>
      <span class="pill" id="viewPill">Zoom: 100% • Pan: (0,0)</span>
      <span class="pill" id="gridPill">Grid: 64px</span>
      <span class="pill" id="mapPill">Map: off(0,0) scale 1 rot 0°</span>
      <span class="hint">Grid combat, map alignment, and AI-assisted turns.</span>
    </div>
    <div class="mobileCanvasToolbar" id="mobileCanvasToolbar" hidden aria-label="Mobile canvas controls">
      <button type="button" class="mobileCanvasModeBtn" id="mobileCanvasNavigateBtn" data-canvas-mode="navigate" aria-pressed="true">Navigate</button>
      <button type="button" class="mobileCanvasModeBtn" id="mobileCanvasMoveBtn" data-canvas-mode="move" aria-pressed="false">Move</button>
    </div>
    <canvas id="stage"></canvas>
    <div class="stageWatermark" aria-label="DrowVTT watermark">
      <div class="brandSigil stageWatermarkSigil" aria-hidden="true">
        <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
          <polygon points="32,4 51,14 60,32 51,50 32,60 13,50 4,32 13,14" fill="rgba(90,169,255,.14)" stroke="rgba(188,225,255,.9)" stroke-width="2.5" />
          <polyline points="32,4 32,60" fill="none" stroke="rgba(188,225,255,.7)" stroke-width="2" />
          <polyline points="13,14 51,14 60,32 51,50 13,50 4,32 13,14" fill="none" stroke="rgba(188,225,255,.45)" stroke-width="1.7" />
          <polyline points="13,14 32,32 51,14" fill="none" stroke="rgba(188,225,255,.55)" stroke-width="1.7" />
          <polyline points="13,50 32,32 51,50" fill="none" stroke="rgba(188,225,255,.55)" stroke-width="1.7" />
          <circle cx="32" cy="32" r="2.8" fill="rgba(231,244,255,.92)" />
        </svg>
      </div>
      <div class="stageWatermarkWordmark">DrowVTT</div>
    </div>
  </main>
</div>
<div class="contextMenu" id="tokenContextMenu" hidden>
  <button type="button" class="menuItem" id="menuAddArt">Add art</button>
  <button type="button" class="menuItem" id="menuClearArt">Clear art</button>
</div>
<div class="modalBackdrop" id="tokenArtModal" hidden>
  <div class="artModal" role="dialog" aria-modal="true" aria-labelledby="tokenArtTitle">
    <div class="artPreviewCard">
      <div class="subtleLabel">Token Crop</div>
      <h2 id="tokenArtTitle" style="margin-top:0">Token art</h2>
      <div class="artPreviewShell" id="artPreviewShell">
        <canvas class="artPreviewCanvas" id="artPreviewCanvas" width="320" height="320"></canvas>
        <div class="artCropRing"></div>
      </div>
      <div class="artHint">Drag inside the preview to pan. Use zoom and offsets for precise framing.</div>
    </div>
    <div class="artControlsCard">
      <div class="subtleLabel">Artwork</div>
      <div class="artToolbar">
        <button type="button" id="chooseTokenArt" class="primary">Choose image</button>
        <button type="button" id="resetTokenArtCrop">Reset crop</button>
      </div>
      <input id="tokenArtFile" type="file" accept="image/*" hidden />
      <div class="artMeta" id="tokenArtMeta">No image selected yet.</div>
      <div class="sliderGrid">
        <div>
          <label for="tokenArtZoom">Zoom</label>
          <input id="tokenArtZoom" type="range" min="1" max="3" step="0.01" value="1" />
        </div>
        <div>
          <label for="tokenArtPanX">Horizontal</label>
          <input id="tokenArtPanX" type="range" min="-1" max="1" step="0.01" value="0" />
        </div>
        <div>
          <label for="tokenArtPanY">Vertical</label>
          <input id="tokenArtPanY" type="range" min="-1" max="1" step="0.01" value="0" />
        </div>
      </div>
      <div class="artModalActions">
        <button type="button" id="cancelTokenArt">Cancel</button>
        <button type="button" id="saveTokenArt" class="primary">Save art</button>
      </div>
    </div>
  </div>
</div>`;

const BACKEND_ENDPOINT_HTML = String.raw`<label>Backend endpoint</label>
            <input id="apiUrl" type="text" value="http://localhost:3000/api/vtt" />`;

export function renderOssVttShell(options = {}) {
  const showApiEndpoint = options.showApiEndpoint ?? true;
  const sidebarAfterBrandHtml = typeof options.sidebarAfterBrandHtml === 'string'
    ? options.sidebarAfterBrandHtml
    : '';

  return OSS_VTT_SHELL_HTML
    .replace('__SIDEBAR_AFTER_BRAND_HTML__', sidebarAfterBrandHtml)
    .replace('__BACKEND_ENDPOINT_HTML__', showApiEndpoint ? BACKEND_ENDPOINT_HTML : '');
}
