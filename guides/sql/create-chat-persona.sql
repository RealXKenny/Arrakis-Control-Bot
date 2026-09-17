-- TEMPLATE for the inspected Dune schema, not a universal game migration.
-- Read ../rabbitmq-discord.md first. Back up the game database.
-- Edit the settings below. This creates a NEW persona; do not run for an
-- existing Arrakis Control account. Duplicate identities/IDs abort the transaction.
BEGIN;
DO $persona$
DECLARE
    persona_hex text := 'REPLACE_WITH_UNUSED_16_CHARACTER_HEX';
    persona_funcom text := 'ArrakisControl#0001';
    persona_name text := 'Arrakis Control';
    target_server text := 'REPLACE_WITH_EXISTING_SERVER_ID';
    target_partition bigint := 1;
    target_map text := 'HaggaBasin';
    target_dimension integer := 0;
    -- Reserve THREE unused positive actor IDs before running.
    controller_id bigint := 900000401;
    state_actor_id bigint := 900000402;
    pawn_id bigint := 900000403;
    new_account bigint;
BEGIN
    IF persona_hex !~ '^[A-Fa-f0-9]{16}$'
       OR target_server LIKE 'REPLACE_%' THEN
        RAISE EXCEPTION 'Edit the persona hex ID and server ID first';
    END IF;
    IF EXISTS (SELECT 1 FROM dune.accounts WHERE "user" = persona_hex OR funcom_id = persona_funcom) THEN
        RAISE EXCEPTION 'Persona already exists; inspect it instead of creating another';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM dune.world_partition WHERE partition_id = target_partition)
       OR NOT EXISTS (SELECT 1 FROM dune.encrypted_player_state WHERE server_id = target_server) THEN
        RAISE EXCEPTION 'Verify the partition and server against this deployment';
    END IF;
    IF controller_id <= 0 OR state_actor_id <= 0 OR pawn_id <= 0
       OR controller_id = state_actor_id OR controller_id = pawn_id OR state_actor_id = pawn_id
       OR EXISTS (SELECT 1 FROM dune.actors WHERE id IN (controller_id, state_actor_id, pawn_id)) THEN
        RAISE EXCEPTION 'Choose three distinct unused positive actor IDs';
    END IF;

    -- Use the database defaults for account/player-state row IDs, not MAX(id)+1.
    INSERT INTO dune.encrypted_accounts
        ("user", encrypted_funcom_id, encrypted_platform_id, platform_name, takeoverable)
    VALUES (persona_hex, dune.encrypt_user_data(persona_funcom),
            dune.encrypt_user_data('redblink-console'), 'RedBlink Console', false)
    RETURNING id INTO new_account;

    INSERT INTO dune.actors
        (id, class, map, partition_id, dimension_index, gas_attributes, properties, owner_account_id, serial)
    VALUES
        (controller_id, '/Game/Dune/Characters/Player/BP_DunePlayerController.BP_DunePlayerController_C',
         target_map, target_partition, target_dimension, '{}'::jsonb, '{}'::jsonb, new_account, 1),
        (state_actor_id, '/Script/DuneSandbox.DunePlayerState',
         target_map, target_partition, target_dimension, '{}'::jsonb, '{}'::jsonb, new_account, 1),
        (pawn_id, '/Game/Dune/Characters/Player/BP_DunePlayerCharacter.BP_DunePlayerCharacter_C',
         target_map, target_partition, target_dimension, '{}'::jsonb, '{}'::jsonb, new_account, 1);

    INSERT INTO dune.encrypted_player_state
        (account_id, encrypted_character_name, last_avatar_activity, server_id,
         player_controller_id, player_state_id, player_pawn_id, life_state,
         online_status, character_state, previous_server_partition_id,
         is_coriolis_processed, return_dimension_index, home_dimension_index)
    VALUES (new_account, dune.encrypt_user_data(persona_name),
            TIMESTAMPTZ '1970-01-01 00:00:00+00', target_server,
            controller_id, state_actor_id, pawn_id, 'Alive', 'Offline', 'Active',
            target_partition, false, target_dimension, target_dimension);
    RAISE NOTICE 'Created account %, controller %, state actor %, pawn %',
        new_account, controller_id, state_actor_id, pawn_id;
END;
$persona$;
COMMIT;
