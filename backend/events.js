const events = [
    // NxNxN Cubes
    { id: '333', name: '3x3x3 Cube', shortName: '3x3' },
    { id: '222', name: '2x2x2 Cube', shortName: '2x2' },
    { id: '444', name: '4x4x4 Cube', shortName: '4x4' },
    { id: '555', name: '5x5x5 Cube', shortName: '5x5' },
    { id: '666', name: '6x6x6 Cube', shortName: '6x6' },
    { id: '777', name: '7x7x7 Cube', shortName: '7x7' },
    { id: '888', name: '8x8x8 Cube', shortName: '8x8' },
    { id: '999', name: '9x9x9 Cube', shortName: '9x9' },

    // One-Handed
    { id: '333oh', name: '3x3x3 One-Handed', shortName: '3x3 OH' },
    { id: '222oh', name: '2x2x2 One-Handed', shortName: '2x2 OH' },
    { id: '333oh_x2', name: '3x3x3 Double One-Handed', shortName: 'Double OH' },
    { id: '333oh_water', name: '3x3x3 H2OH', shortName: 'H2OH' },
    { id: '444oh', name: '4x4x4 One-Handed', shortName: '4x4 OH' },
    { id: 'minx_oh', name: 'Megaminx One-Handed', shortName: 'Minx OH' },
    { id: 'clock_oh', name: 'Clock One-Handed', shortName: 'Clock OH' },
    { id: 'magic_oh', name: 'Magic One-Handed', shortName: 'Magic OH' },

    // FTO
    { id: 'fto', name: 'Face-Turning Octahedron', shortName: 'FTO' },
    {
        id: 'fto_bld',
        name: 'Face-Turning Octahedron Blindfolded',
        shortName: 'FTO BLD',
    },
    {
        id: 'fto_mbld',
        name: 'Face-Turning Octahedron Multi-Blind',
        shortName: 'FTO MBLD',
    },

    // Feet
    { id: '333ft', name: '3x3x3 With Feet', shortName: 'Feet' },
    { id: '444ft', name: '4x4x4 With Feet', shortName: '4x4 Feet' },

    // Clock
    { id: 'clock', name: 'Clock', shortName: 'Clock' },
    { id: 'penta_clock', name: 'Pentagonal Clock', shortName: '5x5 Clock' },
    { id: 'clock_doubles', name: 'Clock Doubles', shortName: 'Clock Dbl.' },

    // Pyraminx
    { id: 'pyram', name: 'Pyraminx', shortName: 'Pyram' },
    { id: 'mpyram', name: 'Master Pyraminx', shortName: 'Master Pyram' },
    { id: 'pyram_duo', name: 'Pyraminx Duo', shortName: 'Pyram Duo' },
    { id: 'pyramorphix', name: 'Pyramorphix', shortName: 'Pyramorph' },

    // Minx
    { id: 'minx', name: 'Megaminx', shortName: 'Minx' },
    { id: 'kilominx', name: 'Kilominx', shortName: 'Kilo' },
    { id: 'mkilominx', name: 'Master Kilominx', shortName: 'M. Kilo' },
    { id: 'gigaminx', name: 'Gigaminx', shortName: 'Giga' },

    // Skewb
    { id: 'skewb', name: 'Skewb', shortName: 'Skewb' },
    { id: 'redi', name: 'Redi Cube', shortName: 'Redi' },
    { id: 'ivy_cube', name: 'Ivy Cube', shortName: 'Ivy' },

    // Square-1
    { id: 'sq1', name: 'Square-1', shortName: 'SQ1' },

    // Mirror Blocks
    { id: '333_mirror_blocks', name: 'Mirror Blocks', shortName: 'Mirror' },
    {
        id: '222_mirror_blocks',
        name: '2x2x2 Mirror Blocks',
        shortName: '2x2 Mirror',
    },
    {
        id: '333_mirror_blocks_bld',
        name: 'Mirror Blocks Blindfolded',
        shortName: 'Mirror BLD',
    },

    // Magic
    { id: 'magic', name: 'Magic', shortName: 'Magic' },
    { id: 'mmagic', name: 'Master Magic', shortName: 'M. Magic' },

    // Relays
    { id: 'miniguild', name: 'Mini Guildford', shortName: 'Mini Guild' },
    {
        id: 'miniguild_2_person',
        name: '2-man Mini Guildford',
        shortName: '2p Guild',
    },
    { id: '234relay', name: '2x2x2-4x4x4 Relay', shortName: '2-4 Relay' },
    { id: '2345relay', name: '2x2x2-5x5x5 Relay', shortName: '2-5 Relay' },
    { id: '234567relay', name: '2x2x2-7x7x7 Relay', shortName: '2-7 Relay' },
    {
        id: '234567relay_2_person',
        name: '2-man 2x2x2-7x7x7 Relay',
        shortName: '2p 2-7 Relay',
    },

    // 3x3 Variations
    { id: '333fm', name: '3x3x3 Fewest Moves', shortName: '3x3 FM' },
    {
        id: '333_linear_fm',
        name: '3x3x3 Linear Fewest Moves',
        shortName: 'Linear FM',
    },
    { id: '333mts', name: '3x3x3 Match The Scramble', shortName: 'MTS' },
    {
        id: '333mts_old',
        name: '3x3x3 Match The Scramble With Inspection',
        shortName: 'MTS Old',
    },
    {
        id: '333_team_factory',
        name: '3x3x3 Team Factory',
        shortName: 'Team Factory',
    },
    {
        id: '333_inspectionless',
        name: '3x3x3 No Inspection',
        shortName: 'No Inspect',
    },
    { id: '333_scrambling', name: '3x3x3 Scrambling', shortName: 'Scramble' },
    { id: '333_one_side', name: '3x3x3 One Side', shortName: 'One Side' },
    {
        id: '333_x3_relay',
        name: 'Three 3x3x3 Cubes Relay',
        shortName: '3x3 Relay',
    },
    { id: '333_cube_mile', name: '3x3x3 Cube Mile', shortName: 'Cube Mile' },
    {
        id: '333_oven_mitts',
        name: '3x3x3 With Oven Mitts',
        shortName: 'Oven Mitts',
    },
    { id: '333_supersolve', name: '3x3x3 Supersolve', shortName: 'Supersolve' },
    { id: '333_siamese', name: 'Siamese Cube', shortName: 'Siamese' },

    // Cuboids
    { id: '222_squared', name: '2x2x2 Squared', shortName: '2x2 Sq.' },
    { id: '223_cuboid', name: '2x2x3 Cuboid', shortName: '2x2x3' },
    { id: '223_banana', name: '2x2x3 Banana', shortName: 'Banana' },

    // NxNxN Blindfolded
    { id: '222bf', name: '2x2x2 Blindfolded', shortName: '2x2 BLD' },
    { id: '333bf', name: '3x3x3 Blindfolded', shortName: '3x3 BLD' },
    { id: '444bf', name: '4x4x4 Blindfolded', shortName: '4x4 BLD' },
    { id: '555bf', name: '5x5x5 Blindfolded', shortName: '5x5 BLD' },
    { id: '666bf', name: '6x6x6 Blindfolded', shortName: '6x6 BLD' },
    { id: '777bf', name: '7x7x7 Blindfolded', shortName: '7x7 BLD' },
    { id: '888bf', name: '8x8x8 Blindfolded', shortName: '8x8 BLD' },
    { id: '999bf', name: '9x9x9 Blindfolded', shortName: '9x9 BLD' },
    { id: '101010bf', name: '10x10x10 Blindfolded', shortName: '10x10 BLD' },
    { id: '111111bf', name: '11x11x11 Blindfolded', shortName: '11x11 BLD' },

    // Minx Blindfolded
    { id: 'minx_bld', name: 'Megaminx Blindfolded', shortName: 'Minx BLD' },
    {
        id: 'minx444_bld',
        name: 'Master Kilominx Blindfolded',
        shortName: 'M. Kilo BLD',
    },
    { id: 'minx555_bld', name: 'Gigaminx Blindfolded', shortName: 'Giga BLD' },
    {
        id: 'minx2345relay_bld',
        name: 'Kilo-Gigaminx Relay Blindfolded',
        shortName: 'Kilo-Giga BLD',
    },

    // Other Blindfolded
    { id: '333_speed_bld', name: '3x3x3 Speed-Blind', shortName: 'Speed BLD' },
    { id: '333_team_bld', name: '3x3x3 Team-Blind', shortName: 'Team BLD' },
    {
        id: '333_team_bld_old',
        name: '3x3x3 Team-Blind With Inspection',
        shortName: 'Team BLD Old',
    },
    { id: 'sq1_bld', name: 'Square-1 Blindfolded', shortName: 'SQ1 BLD' },
    {
        id: 'pyram_crystal_bld',
        name: 'Pyraminx Crystal Blindfolded',
        shortName: 'Pyram Cr. BLD',
    },

    // Multi-Blindfolded
    { id: '333mbf', name: '3x3x3 Multi-Blind', shortName: '3x3 MBLD' },
    { id: '444mbf', name: '4x4x4 Multi-Blind', shortName: '4x4 MBLD' },
    { id: '555mbf', name: '5x5x5 Multi-Blind', shortName: '5x5 MBLD' },
    { id: 'sq1_mbo', name: 'Square-1 Multi-Blind', shortName: 'SQ1 MBLD' },
    { id: '333mbo', name: '3x3x3 Multi-Blind Old Style', shortName: 'Old MBLD' },

    // Relays Blindfolded
    {
        id: '333_oh_bld_team_relay',
        name: '3x3x3 + OH + BLD Team Relay',
        shortName: '3x3+OH+Blind Relay',
    },
    {
        id: '333bf_2_person_relay',
        name: '3x3x3 Blindfolded 2-man Relay',
        shortName: 'BLD 2p Relay',
    },
    {
        id: '333bf_3_person_relay',
        name: '3x3x3 Blindfolded 3-man Relay',
        shortName: 'BLD 3p Relay',
    },
    {
        id: '333bf_4_person_relay',
        name: '3x3x3 Blindfolded 4-man Relay',
        shortName: 'BLD 4p Relay',
    },
    {
        id: '333bf_8_person_relay',
        name: '3x3x3 Blindfolded 8-man Relay',
        shortName: 'BLD 8p Relay',
    },
    {
        id: '2345relay_bld',
        name: '2x2x2-5x5x5 Relay Blindfolded',
        shortName: '2-5 BLD Relay',
    },
    {
        id: '234567relay_bld',
        name: '2x2x2-7x7x7 Relay Blindfolded',
        shortName: '2-7 BLD Relay',
    },
    {
        id: '2345678relay_bld',
        name: '2x2x2-8x8x8 Relay Blindfolded',
        shortName: '2-8 BLD Relay',
    },
    {
        id: 'miniguild_bld',
        name: 'Mini Guildford Blindfolded',
        shortName: 'Mini Guild BLD',
    },

    // Other
    { id: '15puzzle', name: '15 Puzzle', shortName: '15 Puzz.' },
    {
        id: 'corner_heli222',
        name: 'Corner Helicopter 2x2x2',
        shortName: 'Heli 2x2',
    },
    { id: 'gear_cube', name: 'Gear Cube', shortName: 'Gear' },
    { id: 'rainbow_cube', name: 'Rainbow Cube', shortName: 'Rainbow' },
    { id: '360_puzzle', name: '360 Puzzle', shortName: '360' },
    { id: 'snake', name: 'Snake', shortName: 'Snake' },
    { id: 'dino', name: 'Dino Cube', shortName: 'Dino' },
];

module.exports = events;
