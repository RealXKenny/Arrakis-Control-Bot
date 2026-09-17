-- Arrakis Control persona repair for the schema inspected in this deployment.
-- Adapted from Red-Blink's ensureSyntheticWhisperPersonaActors/PlayerRows:
-- https://github.com/Red-Blink/dune-awakening-selfhost-docker/blob/5e2197e14d7a51a5b4d24166320019b4d102b93a/console/api/src/carePackage.js
-- Does not change other accounts, reuse player actors, or overwrite actor IDs.
-- Run the complete script in the game database, not the bot's ticket database.

BEGIN;

DO $repair$
DECLARE
    target_state dune.encrypted_player_state%ROWTYPE;
BEGIN
    SELECT ps.* INTO STRICT target_state
    FROM dune.encrypted_player_state AS ps
    JOIN dune.accounts AS account ON account.id = ps.account_id
    WHERE ps.id = 17
      AND ps.account_id = 57
      AND account."user" = '5E121CE000000004'
      AND account.funcom_id = 'ArrakisControl#0001'
    FOR UPDATE OF ps;

    IF target_state.player_controller_id IS NOT NULL
       OR target_state.player_state_id IS NOT NULL
       OR target_state.player_pawn_id IS NOT NULL THEN
        RAISE EXCEPTION 'Persona already has actor links; no changes made. Inspect those links before retrying.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM dune.world_partition WHERE partition_id = 1
    ) THEN
        RAISE EXCEPTION 'Expected partition 1 is missing; no changes made.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM dune.encrypted_player_state
        WHERE account_id <> 57
          AND server_id = 'vyM5wfCoT9aWcsCIJNnnQg'
    ) THEN
        RAISE EXCEPTION 'Expected server ID is no longer present; no changes made.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM dune.actors
        WHERE id IN (900000401, 900000402, 900000403)
    ) THEN
        RAISE EXCEPTION 'A proposed synthetic actor ID is occupied; no changes made.';
    END IF;

    INSERT INTO dune.actors (
        id, class, map, partition_id, dimension_index,
        gas_attributes, properties, owner_account_id, serial
    ) VALUES
        (900000401, '/Game/Dune/Characters/Player/BP_DunePlayerController.BP_DunePlayerController_C',
         'HaggaBasin', 1, 0, '{}'::jsonb, '{}'::jsonb, 57, 1),
        (900000402, '/Script/DuneSandbox.DunePlayerState',
         'HaggaBasin', 1, 0, '{}'::jsonb, '{}'::jsonb, 57, 1),
        (900000403, '/Game/Dune/Characters/Player/BP_DunePlayerCharacter.BP_DunePlayerCharacter_C',
         'HaggaBasin', 1, 0, '{}'::jsonb, '{}'::jsonb, 57, 1);

    UPDATE dune.encrypted_player_state
    SET player_controller_id = 900000401,
        player_state_id = 900000402,
        player_pawn_id = 900000403,
        last_avatar_activity = TIMESTAMPTZ '1970-01-01 00:00:00+00',
        life_state = 'Alive',
        online_status = 'Offline',
        server_id = 'vyM5wfCoT9aWcsCIJNnnQg',
        previous_server_partition_id = 1,
        is_coriolis_processed = false,
        return_dimension_index = 0,
        home_dimension_index = 0
    WHERE id = 17 AND account_id = 57;
END;
$repair$;

SELECT id, account_id, online_status, server_id,
       player_controller_id, player_state_id, player_pawn_id
FROM dune.encrypted_player_state
WHERE id = 17 AND account_id = 57;

COMMIT;
